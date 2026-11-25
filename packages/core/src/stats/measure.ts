import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { sharedPaths } from '../frameworks/index.js';
import * as git from '../git.js';
import { run } from '../util/exec.js';

const MB = 1024 * 1024;
const SIZE_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  bytes: number;
  expiresAt: number;
}

const sizeCache = new Map<string, CacheEntry>();

/**
 * Clears the in-memory directory size cache used by `measureDirBytes`.
 *
 * @example
 * clearSizeCache();
 */
export function clearSizeCache(): void {
  sizeCache.clear();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function walkDirBytes(dirPath: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await walkDirBytes(full);
    } else if (entry.isFile()) {
      const st = await lstat(full).catch(() => undefined);
      if (st) total += st.size;
    }
  }
  return total;
}

/**
 * Measures the on-disk byte size of a directory without ever following symlinks.
 *
 * Uses `du -sk` on POSIX systems for speed on large `node_modules`/`.venv` trees, falling back
 * to a symlink-safe recursive `lstat` walk on Windows or if `du` is unavailable.
 *
 * @param dirPath - Absolute or relative path to a directory or file.
 * @param opts - Optional `{ useCache?: boolean }` (default `true`, 30s TTL).
 * @returns Size in bytes, or `0` if the path does not exist or is a symlink.
 *
 * @example
 * const bytes = await measureDirBytes('/code/app/node_modules');
 */
export async function measureDirBytes(dirPath: string, opts?: { useCache?: boolean }): Promise<number> {
  const resolved = path.resolve(dirPath);
  const useCache = opts?.useCache ?? true;
  if (useCache) {
    const cached = sizeCache.get(resolved);
    if (cached && cached.expiresAt > Date.now()) return cached.bytes;
  }

  const st = await lstat(resolved).catch(() => undefined);
  if (!st || st.isSymbolicLink()) return 0;

  let bytes = st.size;
  if (st.isDirectory()) {
    if (process.platform !== 'win32') {
      try {
        // `du -sk` never follows symlinks unless `-L` is given, and reports physical KiB blocks.
        const { stdout } = await run('du', ['-sk', resolved], path.dirname(resolved));
        const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10);
        bytes = Number.isFinite(kb) ? kb * 1024 : await walkDirBytes(resolved);
      } catch {
        bytes = await walkDirBytes(resolved);
      }
    } else {
      bytes = await walkDirBytes(resolved);
    }
  }

  if (useCache) {
    sizeCache.set(resolved, { bytes, expiresAt: Date.now() + SIZE_CACHE_TTL_MS });
  }
  return bytes;
}

export interface RepoSharedSizes {
  sharedDepsBytes: number;
  sharedDepsByRel: Map<string, number>;
  sharedGitBytes: number;
}

/**
 * Measures a repository's shared dependency directories (`node_modules`, `.venv`, etc.)
 * and its shared `.git/objects` store once so per-worktree savings can be computed cheaply.
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @param useCache - Whether to reuse the 30s directory size cache (default `true`).
 * @returns Total shared dependency bytes, per-relative-path map, and `.git/objects` bytes.
 *
 * @example
 * const sizes = await measureRepoSharedSizes('/code/app');
 */
export async function measureRepoSharedSizes(mainRoot: string, useCache = true): Promise<RepoSharedSizes> {
  const sharedDepsByRel = new Map<string, number>();
  let sharedDepsBytes = 0;

  for (const rel of sharedPaths('dependencies')) {
    const full = path.join(mainRoot, rel);
    const bytes = await measureDirBytes(full, { useCache });
    if (bytes > 0) {
      sharedDepsByRel.set(rel, bytes);
      sharedDepsBytes += bytes;
    }
  }

  let sharedGitBytes = 0;
  const commonDir = await git.gitCommonDir(mainRoot).catch(() => undefined);
  if (commonDir) {
    sharedGitBytes = await measureDirBytes(path.join(commonDir, 'objects'), { useCache });
  }

  return { sharedDepsBytes, sharedDepsByRel, sharedGitBytes };
}

export interface TimeSavedEstimateParams {
  /** Root-relative shared dependency paths linked for this worktree (e.g. `['node_modules']`). */
  linkedDepRels: string[];
  /** Byte size of the linked dependency directories in the main repo. */
  linkedDepsBytes: number;
  /** Byte size of `.git/objects` shared via the worktree. */
  sharedGitBytes: number;
}

/**
 * Estimates milliseconds saved by creating a ParaSpace worktree instead of a full `git clone`
 * plus fresh dependency installation.
 *
 * Uses a deterministic, size-scaled heuristic:
 * - Git clone avoided: `3s + 0.5s / 50 MB` of `.git/objects` (clamped `3s–60s`)
 * - Node `node_modules` install avoided: `15s + 1s / 10 MB` (clamped `10s–180s`)
 * - Python `.venv`/`venv` setup avoided: `15s + 1s / 15 MB` (clamped `10s–120s`)
 *
 * @param params - Linked dependency metadata and shared `.git/objects` byte size.
 * @returns Estimated time saved in milliseconds (rounded to whole seconds).
 *
 * @example
 * estimateTimeSavedMs({ linkedDepRels: ['node_modules'], linkedDepsBytes: 200 * 1024 * 1024, sharedGitBytes: 10 * 1024 * 1024 });
 */
export function estimateTimeSavedMs({
  linkedDepRels,
  linkedDepsBytes,
  sharedGitBytes,
}: TimeSavedEstimateParams): number {
  let totalMs = clamp(3_000 + (sharedGitBytes / (50 * MB)) * 500, 3_000, 60_000);

  const hasNode = linkedDepRels.includes('node_modules');
  const hasPython = linkedDepRels.some((r) => r === '.venv' || r === 'venv');

  if (hasNode) {
    totalMs += clamp(15_000 + (linkedDepsBytes / (10 * MB)) * 1_000, 10_000, 180_000);
  }
  if (hasPython) {
    totalMs += clamp(15_000 + (linkedDepsBytes / (15 * MB)) * 1_000, 10_000, 120_000);
  }
  if (!hasNode && !hasPython && linkedDepRels.length > 0) {
    totalMs += clamp(10_000 + (linkedDepsBytes / (15 * MB)) * 1_000, 10_000, 120_000);
  }

  return Math.round(totalMs / 1000) * 1000;
}

/**
 * Formats a byte count into a human-readable string (e.g. `'1.42 GB'`, `'318 MB'`, `'0 B'`).
 *
 * @param bytes - Non-negative byte count.
 * @returns Formatted string.
 *
 * @example
 * formatBytes(1536); // → '1.5 KB'
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  const decimals = idx === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[idx]}`;
}

/**
 * Formats a duration in milliseconds into a concise human-readable string (e.g. `'2m 15s'`, `'1h 4m'`).
 *
 * @param ms - Non-negative duration in milliseconds.
 * @returns Formatted duration string.
 *
 * @example
 * formatDuration(95_000); // → '1m 35s'
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  if (ms < 1000) return '< 1s';
  const totalSec = Math.round(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

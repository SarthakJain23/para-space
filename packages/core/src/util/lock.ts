import { open, readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

export interface LockOptions {
  /** Give up after this long (ms). */
  timeoutMs?: number;
  /** A lock older than this (ms) is treated as abandoned. */
  staleMs?: number;
}

interface LockInfo {
  pid: number;
  host: string;
  acquiredAt: number;
}

/**
 * Run `fn` while holding an exclusive lock file (`open(..., 'wx')` is atomic across processes).
 * Not re-entrant: never call it again for the same path from inside `fn`.
 */
export async function withFileLock<T>(lockPath: string, fn: () => Promise<T>, opts: LockOptions = {}): Promise<T> {
  const { timeoutMs = 10_000, staleMs = 30_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  while (!(await tryAcquire(lockPath))) {
    if (await isStale(lockPath, staleMs)) {
      await unlink(lockPath).catch(() => {});
      continue;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for lock ${lockPath}. If no other para process is running, delete that file.`);
    }
    await sleep(25 + Math.random() * 50);
  }
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}

async function tryAcquire(lockPath: string): Promise<boolean> {
  try {
    const handle = await open(lockPath, 'wx');
    const info: LockInfo = { pid: process.pid, host: os.hostname(), acquiredAt: Date.now() };
    await handle.writeFile(JSON.stringify(info));
    await handle.close();
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
}

/** Stale when its owner on this host is dead, or it is older than `staleMs`. Unreadable (mid-write) is not stale. */
async function isStale(lockPath: string, staleMs: number): Promise<boolean> {
  let info: LockInfo;
  try {
    info = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return false;
  }
  if (Date.now() - info.acquiredAt > staleMs) return true;
  return info.host === os.hostname() && !isAlive(info.pid);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

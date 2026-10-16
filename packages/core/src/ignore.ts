import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readTextIfExists } from './util/fs.js';

const MARKER = '# paralleltree';

/** Append any missing lines to an ignore-style file. Returns the lines actually added. */
export async function ensureLines(file: string, lines: string[], header = MARKER): Promise<string[]> {
  const text = (await readTextIfExists(file)) ?? '';
  const present = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = lines.filter((l) => !present.has(l));
  if (!missing.length) return [];
  const prefix = text && !text.endsWith('\n') ? '\n' : '';
  const block = (present.has(header) ? '' : `${header}\n`) + missing.join('\n') + '\n';
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text + prefix + block);
  return missing;
}

/**
 * Ignore ParallelTree's links via `$GIT_COMMON_DIR/info/exclude` — shared by every worktree,
 * never committed. A `node_modules/` pattern only matches directories, not symlinks, so
 * links need their own slash-less, root-anchored patterns (D-019).
 */
export async function excludeFromGit(gitCommonDir: string, relPaths: string[]): Promise<string[]> {
  return ensureLines(
    path.join(gitCommonDir, 'info', 'exclude'),
    relPaths.map((p) => `/${p.split(path.sep).join('/')}`),
  );
}

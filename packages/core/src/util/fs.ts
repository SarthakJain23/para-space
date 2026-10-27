import { lstat, readFile } from 'node:fs/promises';

/**
 * True if anything (file, dir or link — even a dangling one) exists at `p`.
 *
 * @param p - Filesystem path to check.
 * @returns True if `lstat` succeeds on `p`, false otherwise.
 *
 * @example
 * if (await exists('/code/app/package.json')) { ... }
 */
export async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads UTF-8 file contents, or returns `undefined` if the file does not exist. Other errors propagate.
 *
 * @param file - Path to the file to read.
 * @returns File contents as a string, or `undefined` if `ENOENT`.
 *
 * @example
 * const text = await readTextIfExists('/code/app/.env');
 */
export async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

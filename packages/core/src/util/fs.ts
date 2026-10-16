import { lstat, readFile } from 'node:fs/promises';

/** True if anything (file, dir or link — even a dangling one) exists at `p`. */
export async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** File contents, or `undefined` if the file does not exist. Other errors propagate. */
export async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

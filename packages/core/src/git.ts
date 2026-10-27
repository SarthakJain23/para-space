import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { run } from './util/exec.js';

export interface GitWorktree {
  path: string;
  branch?: string;
  head?: string;
  bare: boolean;
  detached: boolean;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await run('git', args, cwd)).stdout.trim();
}

/**
 * Absolute root of the *main* working tree, even when called from inside a linked worktree.
 *
 * @param cwd - Any directory inside the repository or any of its worktrees.
 * @returns Absolute path to the main repository root.
 *
 * @example
 * const root = await mainRepoRoot('/code/app-feat-x'); // → '/code/app'
 */
export async function mainRepoRoot(cwd: string): Promise<string> {
  const commonDir = await gitCommonDir(cwd);
  return realpath(path.dirname(commonDir));
}

export async function gitCommonDir(cwd: string): Promise<string> {
  const dir = await git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return realpath(dir);
}

/**
 * Validates a candidate git branch name according to git ref naming rules.
 *
 * @param value - Candidate branch name string.
 * @returns Error message string if invalid, or undefined if valid.
 *
 * @example
 * validateBranchName('feat/TK-101'); // → undefined
 * validateBranchName('invalid branch name'); // → 'Branch names cannot contain spaces'
 */
export function validateBranchName(value: string): string | undefined {
  const s = value.trim();
  if (!s) return 'Enter a branch name';
  if (/\s/.test(s)) return 'Branch names cannot contain spaces';
  if (s.startsWith('-') || s.endsWith('/') || s.endsWith('.lock') || s.includes('..') || /[~^:?*[\\]/.test(s)) {
    return 'Not a valid git branch name';
  }
  return undefined;
}

/**
 * Checks whether a local branch exists in the repository.
 *
 * @param cwd - Any directory inside the repository or worktree.
 * @param branch - Short branch name to verify.
 * @returns True if the branch exists, false otherwise.
 *
 * @example
 * const exists = await branchExists('/code/app', 'main'); // → true
 */
export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(cwd, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
    return true;
  } catch {
    return false;
  }
}

async function hasOriginRemote(cwd: string): Promise<boolean> {
  try {
    const out = await git(cwd, 'remote');
    return out.split('\n').includes('origin');
  } catch {
    return false;
  }
}

/**
 * Fetches the latest commit for `baseBranch` from `origin`, fast-forwards the local branch
 * (in its checked-out worktree if checked out, or via `git fetch origin base:base` if not),
 * and returns the most up-to-date ref (`origin/<baseBranch>` if fetched, else `baseBranch`).
 */
export async function syncBaseBranch(cwd: string, baseBranch: string): Promise<string> {
  if (!(await hasOriginRemote(cwd))) return baseBranch;

  try {
    await git(cwd, 'fetch', '--quiet', 'origin', baseBranch);
  } catch {
    return baseBranch;
  }

  // Try fast-forwarding the local branch so local refs also stay current
  const trees = await worktreeList(cwd).catch(() => []);
  const checkedOutIn = trees.find((t) => t.branch === baseBranch);
  if (checkedOutIn) {
    await git(checkedOutIn.path, 'pull', '--ff-only', '--quiet', 'origin', baseBranch).catch(() => {});
  } else {
    await git(cwd, 'fetch', '--quiet', 'origin', `${baseBranch}:${baseBranch}`).catch(() => {});
  }

  try {
    await git(cwd, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseBranch}`);
    try {
      await git(cwd, 'merge-base', '--is-ancestor', `refs/remotes/origin/${baseBranch}`, `refs/heads/${baseBranch}`);
      return baseBranch;
    } catch {
      return `origin/${baseBranch}`;
    }
  } catch {
    return baseBranch;
  }
}

export async function worktreeAdd(
  cwd: string,
  wtPath: string,
  branch: string,
  base?: string,
): Promise<{ createdBranch: boolean }> {
  if (await branchExists(cwd, branch)) {
    await git(cwd, 'worktree', 'add', wtPath, branch);
    return { createdBranch: false };
  }
  const baseToSync = base ?? (await currentBranch(cwd));
  const startPoint = baseToSync ? await syncBaseBranch(cwd, baseToSync) : undefined;
  const args = ['worktree', 'add', '--no-track', '-b', branch, wtPath];
  if (startPoint) args.push(startPoint);
  await git(cwd, ...args);
  return { createdBranch: true };
}

export async function worktreeList(cwd: string): Promise<GitWorktree[]> {
  const out = await git(cwd, 'worktree', 'list', '--porcelain');
  const result: GitWorktree[] = [];
  let current: GitWorktree | undefined;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), bare: false, detached: false };
      result.push(current);
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    }
  }
  return result;
}

export async function worktreeRemove(cwd: string, wtPath: string, force = false): Promise<void> {
  const args = ['worktree', 'remove', wtPath];
  if (force) args.push('--force');
  await git(cwd, ...args);
}

export async function worktreePrune(cwd: string): Promise<void> {
  await git(cwd, 'worktree', 'prune');
}

/**
 * Current checked-out branch name in a working tree, or undefined if detached or not in a repo.
 *
 * @param cwd - Working tree or repository directory.
 * @returns Short branch name e.g. `'feat/TK-101'`, or undefined.
 *
 * @example
 * const branch = await currentBranch('/code/app'); // → 'main'
 */
export async function currentBranch(cwd: string): Promise<string | undefined> {
  try {
    const branch = await git(cwd, 'branch', '--show-current');
    return branch || undefined;
  } catch {
    return undefined;
  }
}

/** Local branch names, most recently committed first. */
export async function localBranches(cwd: string): Promise<string[]> {
  const out = await git(cwd, 'for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads');
  return out ? out.split('\n') : [];
}

export async function branchDelete(cwd: string, branch: string, force = false): Promise<void> {
  await git(cwd, 'branch', force ? '-D' : '-d', branch);
}

/** Number of changed/untracked entries in a worktree. */
export async function dirtyCount(wtPath: string): Promise<number> {
  const out = await git(wtPath, 'status', '--porcelain');
  return out ? out.split('\n').length : 0;
}

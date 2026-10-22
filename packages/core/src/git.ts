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

/** Absolute root of the *main* working tree, even when called from inside a linked worktree. */
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

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(cwd, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
    return true;
  } catch {
    return false;
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
  const args = ['worktree', 'add', '-b', branch, wtPath];
  if (base) args.push(base);
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

/** Current checked-out branch in a working tree, or undefined if detached or not a repo. */
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

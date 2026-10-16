import type { Command } from 'commander';
import { removeWorktree } from '@para-space/core';
import { action, log, ok } from '../runtime.js';

export function registerRemove(program: Command) {
  program
    .command('remove <worktree>')
    .alias('rm')
    .description('Remove a worktree (branch, dir name or path)')
    .option('-d, --delete-branch', 'also delete the branch')
    .option('-f, --force', 'remove even with uncommitted changes (and force-delete the branch)')
    .action(
      action(async (target: string, flags: { deleteBranch?: boolean; force?: boolean }) => {
        const res = await removeWorktree({ ...flags, cwd: process.cwd(), target, log });
        ok(`Removed ${res.path}${res.branchDeleted ? ` and branch ${res.branch}` : ''}`);
      }),
    );
}

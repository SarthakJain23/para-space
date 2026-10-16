import type { Command } from 'commander';
import { isolateWorktree } from '@paralleltree/core';
import { action, log, ok } from '../runtime.js';

export function registerIsolate(program: Command) {
  program
    .command('isolate <worktree>')
    .description('Replace shared dependency symlinks with an independent copy (branch, dir name or path)')
    .option('-r, --reason <text>', 'why (recorded in the context ledger)')
    .action(
      action(async (target: string, flags: { reason?: string }) => {
        const res = await isolateWorktree({ cwd: process.cwd(), target, reason: flags.reason, log });
        if (res.isolated.length) ok(`Isolated ${res.isolated.join(', ')} in ${res.path}`);
      }),
    );
}

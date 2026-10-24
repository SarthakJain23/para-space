import { type WorktreeInfo, checkDivergence, discoverWorkspaceRepoRoots, listWorktrees } from '@para-space/core';
import type { Command } from 'commander';
import pc from 'picocolors';
import { action, log, ok, printJson } from '../runtime.js';

export function registerCheck(program: Command) {
  program
    .command('check')
    .description('Check all worktrees for dependency manifest divergence from main')
    .option('--json', 'print results as JSON')
    .action(
      action(async (flags: { json?: boolean }) => {
        const cwd = process.cwd();
        let repoRowSets: WorktreeInfo[][];
        try {
          repoRowSets = [await listWorktrees({ cwd, log })];
        } catch (err) {
          const roots = await discoverWorkspaceRepoRoots(cwd);
          if (roots.length === 0) throw err;
          repoRowSets = await Promise.all(roots.map((root) => listWorktrees({ cwd: root, log })));
        }

        const divergedList = [];
        for (const rows of repoRowSets) {
          const main = rows.find((r) => r.isMain);
          if (!main) throw new Error('No main repository found');

          for (const r of rows) {
            if (r.isMain || r.depsMode !== 'Symlinked') continue;
            const d = await checkDivergence(main.path, r.path);
            if (d.diverged) {
              divergedList.push({ ...r, divergedFiles: d.divergedFiles, strategies: d.strategies });
            }
          }
        }

        if (flags.json) {
          printJson({ clean: divergedList.length === 0, diverged: divergedList });
          if (divergedList.length > 0) process.exitCode = 1;
          return;
        }

        if (divergedList.length === 0) {
          ok('All symlinked worktrees match main repository dependencies.');
          return;
        }

        console.error(pc.yellow(`Found ${divergedList.length} worktree(s) with diverged dependencies:`));
        for (const item of divergedList) {
          console.error(
            `  • ${pc.bold(item.branch ?? item.name)} (${item.path}): diverged in ${item.divergedFiles.join(', ')}`,
          );
          console.error(pc.dim(`    Run: para isolate ${item.branch ?? item.name}`));
        }
        process.exitCode = 1;
      }),
    );
}

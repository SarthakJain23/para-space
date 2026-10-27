import path from 'node:path';
import type { Command } from 'commander';
import Table from 'cli-table3';
import pc from 'picocolors';
import { type WorktreeInfo, discoverWorkspaceRepoRoots, filterWorktreeRows, listWorktrees } from '@para-space/core';
import { action, log, printJson } from '../runtime.js';

function renderTable(rows: WorktreeInfo[]): string {
  const table = new Table({
    head: ['Name / Worktree', 'Branch', 'Status', 'Port', 'Deps Mode'],
    style: { head: ['cyan'] },
  });
  for (const r of rows) {
    const deps = r.diverged ? pc.yellow(`${r.depsMode} (diverged)`) : r.depsMode;
    table.push([
      r.managed ? r.name : `${r.name} ${pc.dim('(unmanaged)')}`,
      r.branch ?? '',
      r.dirty ? pc.yellow(`${r.dirty} dirty`) : pc.green('Clean'),
      r.port ?? pc.dim('—'),
      deps,
    ]);
  }
  return table.toString();
}

export function registerList(program: Command) {
  program
    .command('list [query]')
    .alias('ls')
    .description('List the main repo and all worktrees')
    .option('-q, --query <query>', 'filter worktrees by name, branch, or path')
    .option('--json', 'print as JSON')
    .action(
      action(async (queryArg: string | undefined, flags: { query?: string; json?: boolean }) => {
        const query = flags.query ?? queryArg;
        const cwd = process.cwd();
        let rows: WorktreeInfo[];
        try {
          rows = filterWorktreeRows(await listWorktrees({ cwd, log }), query);
        } catch (err) {
          const roots = await discoverWorkspaceRepoRoots(cwd);
          if (roots.length === 0) throw err;
          const multi = roots.length > 1;
          const perRepo = await Promise.all(
            roots.map(async (root) => {
              const repoName = path.basename(root);
              const repoRows = filterWorktreeRows(await listWorktrees({ cwd: root, log }), query, repoName);
              return multi
                ? repoRows.map((r) => ({ ...r, name: flags.json ? r.name : `[${repoName}] ${r.name}` }))
                : repoRows;
            }),
          );
          rows = perRepo.flat();
        }

        if (flags.json) {
          printJson(rows);
        } else {
          console.log(renderTable(rows));
          if (rows.some((r) => r.diverged)) {
            console.log(
              pc.yellow(
                "\nwarning: Worktree dependencies have diverged from main. Run 'para isolate <branch>' to decouple.",
              ),
            );
          }
        }
      }),
    );
}

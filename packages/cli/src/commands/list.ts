import type { Command } from 'commander';
import Table from 'cli-table3';
import pc from 'picocolors';
import { type WorktreeInfo, listWorktrees } from '@para-space/core';
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
    .command('list')
    .alias('ls')
    .description('List the main repo and all worktrees')
    .option('--json', 'print as JSON')
    .action(
      action(async (flags: { json?: boolean }) => {
        const rows = await listWorktrees({ cwd: process.cwd(), log });
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

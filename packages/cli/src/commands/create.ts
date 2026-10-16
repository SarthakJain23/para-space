import { type CreateOptions, type CreateResult, PORT_STRATEGY_NAMES, createWorktree } from '@paralleltree/core';
import { type Command, Option } from 'commander';
import path from 'node:path';
import pc from 'picocolors';
import { action, log, ok, printJson, prompterFor } from '../runtime.js';

interface Flags {
  base?: string;
  portStrategy?: CreateOptions['portStrategy'];
  basePort?: number;
  portPool?: string;
  ide?: boolean;
  requirement?: string;
  yes?: boolean;
  json?: boolean;
}

function printResult(res: CreateResult) {
  const links = res.links.map((l) => path.relative(res.path, l));
  ok(`Worktree ready: ${pc.bold(res.path)}`);
  console.log(`  branch   ${res.branch}${res.createdBranch ? pc.dim(' (new)') : ''}`);
  console.log(`  links    ${links.length ? links.join(', ') : pc.dim('none')}`);
  console.log(`  port     ${res.port ?? pc.dim('not injected')}`);
  if (res.ideSettingsFile) console.log(`  ide      ${res.color} → ${res.ideSettingsFile}`);
  console.log(pc.dim(`\n  cd ${res.path}`));
}

export function registerCreate(program: Command) {
  program
    .command('create <branch>')
    .description('Create a worktree for <branch> (created from --base if it does not exist)')
    .option('-b, --base <ref>', 'base ref for a new branch (default: current HEAD)')
    .addOption(
      new Option('--port-strategy <name>', 'port strategy on first run (skips the prompt)').choices([
        ...PORT_STRATEGY_NAMES,
      ]),
    )
    .option('--base-port <port>', 'base port on first run', (v) => parseInt(v, 10))
    .option('--port-pool <range>', 'port pool for the pool strategy, e.g. 3001-3020')
    .option('--ide', 'write window color / interpreter to .vscode/settings.json without asking')
    .option('--no-ide', 'never touch .vscode/settings.json')
    .option('-r, --requirement <text>', 'why this worktree exists (recorded in the context ledger)')
    .option('-y, --yes', 'non-interactive: no prompts (defaults: offset strategy, no IDE changes)')
    .option('--json', 'print the result as JSON')
    .action(
      action(async (branch: string, flags: Flags) => {
        const { yes, json, ide: ideFlag, ...options } = flags;
        const prompter = prompterFor(yes);
        const ide = ideFlag === undefined ? (prompter ? 'ask' : 'no') : ideFlag ? 'yes' : 'no';
        const res = await createWorktree({ ...options, cwd: process.cwd(), branch, prompter, ide, log });
        if (json) printJson(res);
        else printResult(res);
      }),
    );
}

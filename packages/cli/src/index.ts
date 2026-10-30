#!/usr/bin/env node
import { Command } from 'commander';
import { registerCheck } from './commands/check.js';
import { registerConfig } from './commands/config.js';
import { registerCreate } from './commands/create.js';
import { registerIsolate } from './commands/isolate.js';
import { registerList } from './commands/list.js';
import { registerRemove } from './commands/remove.js';
import { registerWorkspace } from './commands/workspace.js';
import { registerAgentCommands } from './commands/agent.js';

const program = new Command()
  .name('para')
  .description('ParaSpace — parallel git worktrees with shared dependencies')
  .version('0.1.5');

const commands = [
  registerCreate,
  registerWorkspace,
  registerList,
  registerIsolate,
  registerRemove,
  registerConfig,
  registerCheck,
  registerAgentCommands,
];

for (const register of commands) register(program);

await program.parseAsync();

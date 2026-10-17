#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfig } from './commands/config.js';
import { registerCreate } from './commands/create.js';
import { registerIsolate } from './commands/isolate.js';
import { registerList } from './commands/list.js';
import { registerRemove } from './commands/remove.js';

const program = new Command()
  .name('para')
  .description('ParaSpace — parallel git worktrees with shared dependencies')
  .version('0.1.0');

const commands = [registerCreate, registerList, registerIsolate, registerRemove, registerConfig];

for (const register of commands) register(program);

await program.parseAsync();

import type * as vscode from 'vscode';
import type { CommandContext } from './context.js';
import { registerCreate } from './create.js';
import { registerIsolate } from './isolate.js';
import { registerList, registerOpen, registerRefresh } from './list.js';
import { registerRemove } from './remove.js';

export type { CommandContext } from './context.js';

const COMMANDS = [registerList, registerOpen, registerRefresh, registerCreate, registerIsolate, registerRemove];

/** Register every `paraSpace.*` command declared in package.json. */
export function registerCommands(ctx: CommandContext): vscode.Disposable[] {
  return COMMANDS.map((register) => register(ctx));
}

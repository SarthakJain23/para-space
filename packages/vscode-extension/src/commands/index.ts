import type * as vscode from 'vscode';
import { registerConfigure } from './config.js';
import type { CommandContext } from './context.js';
import { registerCreate } from './create.js';
import { registerIsolate } from './isolate.js';
import { registerLedgerCommands } from './ledger.js';
import { registerList, registerOpen, registerRefresh } from './list.js';
import { registerRemove } from './remove.js';

export type { CommandContext } from './context.js';

/** Register every `paraSpace.*` command declared in package.json. */
export function registerCommands(ctx: CommandContext): vscode.Disposable[] {
  return [
    registerList(ctx),
    registerOpen(ctx),
    registerRefresh(ctx),
    registerCreate(ctx),
    registerIsolate(ctx),
    registerRemove(ctx),
    registerConfigure(ctx),
    ...registerLedgerCommands(ctx),
  ];
}

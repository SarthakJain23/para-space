import type { Logger } from '@para-space/core';
import * as vscode from 'vscode';

/** Extension-wide plumbing, the counterpart of the CLI's `runtime.ts`. */
export interface Runtime {
  output: vscode.OutputChannel;
  log: Logger;
}

export function createRuntime(): Runtime {
  const output = vscode.window.createOutputChannel('ParaSpace');
  return {
    output,
    log: {
      info: (m) => output.appendLine(m),
      warn: (m) => output.appendLine(`warning: ${m}`),
    },
  };
}

/** Thrown when the user dismisses a prompt; `action()` ends the command quietly. */
export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
  }
}

/** Wrap a command handler: log errors and show them as a notification instead of failing silently. */
export function action<A extends unknown[]>({ output }: Runtime, fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof CancelledError) return;
      const message = (err as Error).message;
      output.appendLine(`error: ${message}`);
      vscode.window.showErrorMessage(`ParaSpace: ${message}`);
    }
  };
}

/** `showInputBox` that stays open on focus loss and throws `CancelledError` on Escape. */
export async function ask(opts: vscode.InputBoxOptions): Promise<string> {
  const value = await vscode.window.showInputBox({ ignoreFocusOut: true, ...opts });
  if (value === undefined) throw new CancelledError();
  return value;
}

/** `showQuickPick` for a single item that throws `CancelledError` on Escape. */
export async function pick<T extends vscode.QuickPickItem>(items: T[], opts: vscode.QuickPickOptions): Promise<T> {
  const picked = await vscode.window.showQuickPick(items, { ignoreFocusOut: true, ...opts });
  if (!picked) throw new CancelledError();
  return picked;
}

/** Run `fn` behind a progress notification. */
export function withProgress<T>(title: string, fn: () => Promise<T>): Thenable<T> {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, fn);
}

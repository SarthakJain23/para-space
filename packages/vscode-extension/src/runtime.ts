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

/** Wrap a command handler: log errors and show them as a notification instead of failing silently. */
export function action<A extends unknown[]>({ output }: Runtime, fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      const message = (err as Error).message;
      output.appendLine(`error: ${message}`);
      vscode.window.showErrorMessage(`ParaSpace: ${message}`);
    }
  };
}

import type { Logger } from '@para-space/core';
import * as vscode from 'vscode';
import { buildBranchPickItems, validateBranchName } from './dialogs.js';

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

/** `showQuickPick` for multiple items; Escape throws `CancelledError`, while an empty selection is returned. */
export async function pickMany<T extends vscode.QuickPickItem>(
  items: T[],
  opts: Omit<vscode.QuickPickOptions, 'canPickMany'>,
): Promise<T[]> {
  const picked = await vscode.window.showQuickPick(items, { ignoreFocusOut: true, ...opts, canPickMany: true });
  if (!picked) throw new CancelledError();
  return picked;
}

/** Run `fn` behind a progress notification. */
export function withProgress<T>(title: string, fn: () => Promise<T>): Thenable<T> {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, fn);
}

export interface BranchPickResult {
  branch: string;
  isNew: boolean;
}

/**
 * `pickBranch` displays a searchable QuickPick with existing branches,
 * while allowing the user to type a new branch name and select "Create new branch".
 */
export async function pickBranch(
  branches: string[],
  opts: { title: string; placeHolder?: string },
): Promise<BranchPickResult> {
  return new Promise((resolve, reject) => {
    const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { isCreate?: boolean; branch?: string }>();
    qp.title = opts.title;
    qp.placeholder = opts.placeHolder ?? 'Select an existing branch or type to create a new branch';
    qp.ignoreFocusOut = true;

    function refresh(filter: string) {
      const items = buildBranchPickItems(filter, branches);
      qp.items = items.map((it) => ({
        label: it.label,
        description: it.description,
        iconPath: it.isCreate ? undefined : new vscode.ThemeIcon('git-branch'),
        alwaysShow: it.alwaysShow,
        isCreate: it.isCreate,
        branch: it.branch,
      }));
    }

    refresh('');

    qp.onDidChangeValue((val) => {
      refresh(val);
    });

    let settled = false;

    qp.onDidAccept(async () => {
      const selected = qp.selectedItems[0];
      if (!selected) {
        const typed = qp.value.trim();
        if (typed) {
          const err = validateBranchName(typed);
          if (err) {
            vscode.window.showErrorMessage(`Invalid branch name: ${err}`);
            return;
          }
          settled = true;
          qp.hide();
          const isExisting = branches.includes(typed);
          resolve({ branch: typed, isNew: !isExisting });
        }
        return;
      }

      if (selected.isCreate) {
        if (selected.branch) {
          settled = true;
          qp.hide();
          resolve({ branch: selected.branch, isNew: true });
        } else {
          // Clicked "Create new branch…" without typing
          settled = true;
          qp.hide();
          try {
            const entered = (
              await ask({
                title: opts.title,
                prompt: 'Branch name (new or existing)',
                placeHolder: 'feat/TK-101',
                validateInput: validateBranchName,
              })
            ).trim();
            const isExisting = branches.includes(entered);
            resolve({ branch: entered, isNew: !isExisting });
          } catch (e) {
            reject(e);
          }
        }
        return;
      }

      settled = true;
      qp.hide();
      resolve({ branch: selected.branch ?? selected.label, isNew: false });
    });

    qp.onDidHide(() => {
      qp.dispose();
      if (!settled) {
        reject(new CancelledError());
      }
    });

    qp.show();
  });
}

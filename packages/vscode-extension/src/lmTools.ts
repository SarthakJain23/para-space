import * as vscode from 'vscode';
import type { CommandContext } from './commands/context.js';
import {
  invokeCreateWorkspace,
  invokeIsolateWorktree,
  invokeListWorktrees,
  invokeOpenWorkspace,
  invokeRemoveWorkspace,
} from './lmToolHandlers.js';

/**
 * Registers VS Code Language Model Tools for GitHub Copilot Chat when supported by the host.
 */
export function registerLmTools(ctx: CommandContext): vscode.Disposable[] {
  const { rt } = ctx;
  const lm = (vscode as unknown as { lm?: { registerTool: (name: string, tool: unknown) => vscode.Disposable } }).lm;
  if (!lm || typeof lm.registerTool !== 'function') {
    rt.log.info('Language Model Tools API not available in this VS Code runtime; skipping registration.');
    return [];
  }

  const disposables: vscode.Disposable[] = [];

  // 1. para_create_workspace
  disposables.push(
    lm.registerTool('para_create_workspace', {
      prepareInvocation(options: { input: { branch: string; requirement?: string; base?: string; repos?: string[] } }) {
        return {
          invocationMessage: `Creating ParaSpace workspace for branch "${options.input.branch}"…`,
        };
      },
      async invoke(options: { input: { branch: string; requirement?: string; base?: string; repos?: string[] } }) {
        return invokeCreateWorkspace(options.input);
      },
    }),
  );

  // 2. para_open_workspace
  disposables.push(
    lm.registerTool('para_open_workspace', {
      prepareInvocation(options: { input: { target: string } }) {
        return {
          invocationMessage: `Opening ParaSpace workspace "${options.input.target}"…`,
        };
      },
      async invoke(options: { input: { target: string } }) {
        return invokeOpenWorkspace(ctx, options.input);
      },
    }),
  );

  // 3. para_list_worktrees
  disposables.push(
    lm.registerTool('para_list_worktrees', {
      prepareInvocation(options?: { input?: { query?: string } }) {
        const query = options?.input?.query?.trim();
        return {
          invocationMessage: query
            ? `Listing ParaSpace worktrees matching "${query}"…`
            : 'Listing ParaSpace worktrees and workspaces…',
        };
      },
      async invoke(options?: { input?: { query?: string } }) {
        return invokeListWorktrees(ctx, options?.input);
      },
    }),
  );

  // 4. para_isolate_worktree
  disposables.push(
    lm.registerTool('para_isolate_worktree', {
      prepareInvocation(options: { input: { target: string; reason?: string } }) {
        return {
          invocationMessage: `Isolating dependencies for worktree "${options.input.target}"…`,
        };
      },
      async invoke(options: { input: { target: string; reason?: string } }) {
        return invokeIsolateWorktree(ctx, options.input);
      },
    }),
  );

  // 5. para_remove_workspace
  disposables.push(
    lm.registerTool('para_remove_workspace', {
      prepareInvocation(options: {
        input: {
          target: string;
          deleteBranch?: boolean;
          deleteWorkspaceFile?: boolean;
          removeWorktrees?: boolean;
          force?: boolean;
        };
      }) {
        return {
          invocationMessage: `Removing ParaSpace workspace/worktree "${options.input.target}"…`,
        };
      },
      async invoke(options: {
        input: {
          target: string;
          deleteBranch?: boolean;
          deleteWorkspaceFile?: boolean;
          removeWorktrees?: boolean;
          force?: boolean;
        };
      }) {
        return invokeRemoveWorkspace(ctx, options.input);
      },
    }),
  );

  rt.log.info('Registered 5 ParaSpace Language Model Tools for AI coding agents.');
  return disposables;
}

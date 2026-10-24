import { isolateWorktree } from '@para-space/core';
import * as vscode from 'vscode';
import type { CommandContext } from './commands/context.js';
import { requireActiveRepoRoot } from './workspace.js';

interface ToolResultPart {
  type: string;
  value: string;
}

function makeToolResult(text: string): unknown {
  const lm = vscode as unknown as {
    LanguageModelToolResult?: new (parts: unknown[]) => unknown;
    LanguageModelTextPart?: new (text: string) => unknown;
  };
  if (typeof lm.LanguageModelToolResult === 'function' && typeof lm.LanguageModelTextPart === 'function') {
    return new lm.LanguageModelToolResult([new lm.LanguageModelTextPart(text)]);
  }
  return { content: [{ type: 'text', value: text }] as ToolResultPart[] };
}

/**
 * Registers VS Code Language Model Tools for GitHub Copilot Chat when supported by the host.
 */
export function registerLmTools({ rt, store }: CommandContext): vscode.Disposable[] {
  const lm = (vscode as unknown as { lm?: { registerTool: (name: string, tool: unknown) => vscode.Disposable } }).lm;
  if (!lm || typeof lm.registerTool !== 'function') {
    rt.log.info('Language Model Tools API not available in this VS Code runtime; skipping registration.');
    return [];
  }

  const disposables: vscode.Disposable[] = [];

  // 1. para_create_workspace
  disposables.push(
    lm.registerTool('para_create_workspace', {
      async invoke(options: { input: { branch: string; requirement?: string; base?: string; repos?: string[] } }) {
        const { branch, requirement, base, repos } = options.input;
        try {
          await vscode.commands.executeCommand('paraSpace.createWorktree', {
            branch,
            requirement,
            base,
            repos,
            ide: 'yes',
          });
          return makeToolResult(
            `Successfully provisioned parallel workspace/worktree for branch "${branch}". The window has been opened.`,
          );
        } catch (err) {
          return makeToolResult(`Failed to create workspace: ${(err as Error).message}`);
        }
      },
    }),
  );

  // 2. para_open_workspace
  disposables.push(
    lm.registerTool('para_open_workspace', {
      async invoke(options: { input: { target: string } }) {
        const { target } = options.input;
        try {
          await vscode.commands.executeCommand('paraSpace.openWorkspace', target);
          return makeToolResult(`Opened workspace matching "${target}" in VS Code.`);
        } catch (err) {
          return makeToolResult(`Failed to open workspace: ${(err as Error).message}`);
        }
      },
    }),
  );

  // 3. para_list_worktrees
  disposables.push(
    lm.registerTool('para_list_worktrees', {
      async invoke(options?: { input?: { query?: string } }) {
        try {
          await store.load();
          const query = options?.input?.query?.trim().toLowerCase();
          const matches = (...values: (string | undefined)[]) =>
            !query || values.some((value) => value?.toLowerCase().includes(query));
          const lines: string[] = ['# ParaSpace Worktrees & Workspaces', ''];
          const workspaces = store.workspaces.filter((ws) =>
            matches(
              ws.name,
              ws.branch,
              ws.workspaceFile,
              ...ws.repos.flatMap((repo) => [repo.name, repo.root, repo.worktreePath]),
            ),
          );

          if (workspaces.length > 0) {
            lines.push('## Multi-Repository Workspaces:');
            for (const ws of workspaces) {
              const repos = ws.repos.map((r) => r.name).join(', ');
              lines.push(`- **${ws.branch}** (${ws.repos.length} repos: ${repos}) → \`${ws.workspaceFile}\``);
            }
            lines.push('');
          }

          lines.push('## Active Repositories & Worktrees:');
          for (const repo of store.repos) {
            const rows = repo.rows.filter((r) => matches(repo.name, repo.root, r.name, r.branch, r.path));
            if (query && rows.length === 0) continue;
            lines.push(`### ${repo.name} (\`${repo.root}\`)`);
            if (rows.length === 0) {
              lines.push('  *(no worktrees)*');
            } else {
              for (const r of rows) {
                const port = r.port !== undefined ? `:${r.port}` : 'no port';
                const status = r.dirty ? `${r.dirty} uncommitted` : 'clean';
                const mainTag = r.isMain ? ' (main)' : '';
                lines.push(
                  `  - **${r.branch ?? r.name}**${mainTag}: ${status} · ${port} · ${r.depsMode} → \`${r.path}\``,
                );
              }
            }
          }

          return makeToolResult(lines.join('\n'));
        } catch (err) {
          return makeToolResult(`Error listing worktrees: ${(err as Error).message}`);
        }
      },
    }),
  );

  // 4. para_isolate_worktree
  disposables.push(
    lm.registerTool('para_isolate_worktree', {
      async invoke(options: { input: { target: string; reason?: string } }) {
        const { target, reason } = options.input;
        try {
          const root = requireActiveRepoRoot(store.roots);
          const res = await isolateWorktree({
            cwd: root,
            target,
            reason,
            log: rt.log,
          });
          void store.load();
          return makeToolResult(
            `Successfully isolated dependencies for worktree "${target}" at ${res.path}. Strategies applied: ${res.isolated.join(', ')}.`,
          );
        } catch (err) {
          return makeToolResult(`Failed to isolate worktree: ${(err as Error).message}`);
        }
      },
    }),
  );

  rt.log.info('Registered 4 ParaSpace Language Model Tools for AI coding agents.');
  return disposables;
}

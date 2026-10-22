import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type CreateResult,
  branchExists,
  buildMultiRepoWorkspaceConfig,
  colorForHex,
  createWorktree,
  discoverWorkspaceRepoRoots,
  exists,
  findWorkspaceConfigFile,
  getWorkspaceRecords,
  isolateWorktree,
  listBranches,
  listWorktrees,
  mainRepoRoot,
  multiRepoWorkspaceFilePath,
  readWorkspaceConfigFile,
  removeWorktree,
  saveWorkspaceRecord,
} from '@para-space/core';
import { z } from 'zod';
import { log } from './runtime.js';

function openWithCode(targetPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn('code', [targetPath], { detached: true, stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Creates and configures the ParaSpace Model Context Protocol (MCP) server.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'paraspace',
    version: '0.1.0',
  });

  // 1. para_create_workspace
  server.tool(
    'para_create_workspace',
    'Creates an isolated Git worktree or parallel multi-repository workspace for a branch with shared dependencies, dedicated dev port, and Peacock window theme.',
    {
      branch: z.string().describe('Branch name to create or checkout (e.g. feat/TK-101)'),
      base: z.string().optional().describe('Base ref for a new branch (default: main or current HEAD)'),
      requirement: z
        .string()
        .optional()
        .describe('Why this worktree/workspace exists (recorded in the context history ledger)'),
      repos: z
        .array(z.string())
        .optional()
        .describe('Optional list of repository paths. If omitted, discovers repositories in cwd.'),
      cwd: z.string().optional().describe('Directory to execute in (default: process.cwd())'),
    },
    async ({ branch, base, requirement, repos, cwd }) => {
      const baseDir = cwd ? path.resolve(cwd) : process.cwd();
      let targetRoots: string[] = [];

      if (repos && repos.length > 0) {
        const resolved = await Promise.all(repos.map((r) => mainRepoRoot(path.resolve(baseDir, r))));
        targetRoots = Array.from(new Set(resolved));
      } else {
        targetRoots = await discoverWorkspaceRepoRoots(baseDir);
      }

      if (targetRoots.length === 0) {
        return {
          content: [{ type: 'text', text: `Error: No Git repositories found in ${baseDir}.` }],
          isError: true,
        };
      }

      // Single repo flow
      if (targetRoots.length === 1) {
        const mainRoot = targetRoots[0];
        try {
          const res = await createWorktree({
            cwd: mainRoot,
            branch,
            base,
            requirement,
            ide: 'yes',
            log,
          });
          await openWithCode(res.path);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    message: `Worktree ready for ${branch}`,
                    worktreePath: res.path,
                    port: res.port,
                    branch: res.branch,
                    color: res.color,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error creating worktree: ${(err as Error).message}` }],
            isError: true,
          };
        }
      }

      // Multi-repo workspace flow
      const results: CreateResult[] = [];
      for (const root of targetRoots) {
        try {
          const hasBranch = await branchExists(root, branch);
          const repoBase = !hasBranch && base && (await branchExists(root, base)) ? base : undefined;
          const res = await createWorktree({
            cwd: root,
            branch,
            base: repoBase,
            requirement,
            ide: 'yes',
            log,
          });
          results.push(res);
        } catch (err) {
          for (const prev of results) {
            try {
              await removeWorktree({
                cwd: prev.mainRoot,
                target: prev.path,
                force: true,
                deleteBranch: prev.createdBranch,
                log,
              });
            } catch {
              // ignore rollback error
            }
          }
          return {
            content: [{ type: 'text', text: `Error creating multi-repo workspace: ${(err as Error).message}` }],
            isError: true,
          };
        }
      }

      const existingWsFile = await findWorkspaceConfigFile(baseDir);
      const existingConfig = existingWsFile ? await readWorkspaceConfigFile(existingWsFile) : undefined;
      const hex = results.find((r) => r.color)?.color;
      const colorProfile = colorForHex(hex);
      const wsConfig = buildMultiRepoWorkspaceConfig(
        results.map((r) => ({ mainRoot: r.mainRoot, worktreePath: r.path })),
        existingConfig,
        colorProfile,
      );
      const workspaceFilePath = multiRepoWorkspaceFilePath(
        results.map((r) => r.path),
        branch,
        existingWsFile,
      );

      await fs.writeFile(workspaceFilePath, JSON.stringify(wsConfig, null, 2), 'utf8');

      await saveWorkspaceRecord({
        id: workspaceFilePath,
        name: path.basename(workspaceFilePath, '.code-workspace'),
        workspaceFile: workspaceFilePath,
        branch,
        color: hex,
        repos: results.map((r) => ({
          root: r.mainRoot,
          name: path.basename(r.mainRoot),
          worktreePath: r.path,
        })),
        createdAt: new Date().toISOString(),
      });

      await openWithCode(workspaceFilePath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message: `Multi-repository workspace ready for ${branch}`,
                workspaceFile: workspaceFilePath,
                worktrees: results.map((r) => ({
                  repo: path.basename(r.mainRoot),
                  path: r.path,
                  port: r.port,
                  branch: r.branch,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 2. para_open_workspace
  server.tool(
    'para_open_workspace',
    'Opens an existing parallel multi-repository workspace or single worktree in VS Code by branch name, workspace name, or file path.',
    {
      target: z.string().describe('Branch name, workspace name, or .code-workspace file path'),
      cwd: z.string().optional().describe('Directory to search from (default: process.cwd())'),
    },
    async ({ target, cwd }) => {
      const baseDir = cwd ? path.resolve(cwd) : process.cwd();
      const roots = await discoverWorkspaceRepoRoots(baseDir);
      const records = await getWorkspaceRecords(roots.length > 0 ? roots : undefined);
      const lower = target.toLowerCase();

      // Check multi-repo workspaces
      const match = records.find(
        (r) =>
          r.branch.toLowerCase() === lower ||
          r.name.toLowerCase() === lower ||
          path.resolve(r.workspaceFile).toLowerCase() === path.resolve(target).toLowerCase() ||
          r.branch.toLowerCase().includes(lower) ||
          r.name.toLowerCase().includes(lower),
      );

      if (match) {
        await openWithCode(match.workspaceFile);
        return {
          content: [{ type: 'text', text: `Opened workspace ${match.name} (${match.workspaceFile}) in VS Code.` }],
        };
      }

      if (target.endsWith('.code-workspace') && (await exists(target))) {
        const resolved = path.resolve(target);
        await openWithCode(resolved);
        return {
          content: [{ type: 'text', text: `Opened workspace file ${resolved} in VS Code.` }],
        };
      }

      // Check single worktree rows
      for (const root of roots) {
        try {
          const rows = await listWorktrees({ cwd: root });
          const rowMatch = rows.find(
            (r) =>
              r.branch?.toLowerCase() === lower ||
              r.name.toLowerCase() === lower ||
              path.resolve(r.path).toLowerCase() === path.resolve(target).toLowerCase(),
          );
          if (rowMatch) {
            await openWithCode(rowMatch.path);
            return {
              content: [{ type: 'text', text: `Opened worktree ${rowMatch.name} (${rowMatch.path}) in VS Code.` }],
            };
          }
        } catch {
          // ignore
        }
      }

      return {
        content: [{ type: 'text', text: `Error: No workspace or worktree found matching "${target}".` }],
        isError: true,
      };
    },
  );

  // 3. para_list_worktrees
  server.tool(
    'para_list_worktrees',
    'Lists all active Git worktrees, assigned dev server ports, and multi-repo workspaces.',
    {
      cwd: z.string().optional().describe('Directory to check from (default: process.cwd())'),
    },
    async ({ cwd }) => {
      const baseDir = cwd ? path.resolve(cwd) : process.cwd();
      const roots = await discoverWorkspaceRepoRoots(baseDir);
      const workspaces = await getWorkspaceRecords(roots.length > 0 ? roots : undefined);

      const repoWorktrees: Record<string, unknown> = {};
      for (const root of roots) {
        try {
          const rows = await listWorktrees({ cwd: root });
          repoWorktrees[path.basename(root)] = rows.map((r) => ({
            name: r.name,
            branch: r.branch,
            path: r.path,
            port: r.port,
            status: r.dirty ? `${r.dirty} uncommitted` : 'clean',
            depsMode: r.depsMode,
            diverged: r.diverged,
          }));
        } catch (err) {
          repoWorktrees[path.basename(root)] = { error: (err as Error).message };
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                workspaces: workspaces.map((w) => ({
                  name: w.name,
                  branch: w.branch,
                  file: w.workspaceFile,
                  repos: w.repos.map((r) => r.name),
                })),
                repositories: repoWorktrees,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 4. para_isolate_worktree
  server.tool(
    'para_isolate_worktree',
    'Replaces shared dependency symlinks in a worktree with an independent copy (APFS CoW clone on macOS, fresh install elsewhere).',
    {
      target: z.string().describe('Branch name, directory name or path of the worktree to isolate'),
      reason: z.string().optional().describe('Why the worktree diverged from main (recorded in context history)'),
      cwd: z.string().optional().describe('Repository directory (default: process.cwd())'),
    },
    async ({ target, reason, cwd }) => {
      const baseDir = cwd ? path.resolve(cwd) : process.cwd();
      try {
        const res = await isolateWorktree({
          cwd: baseDir,
          target,
          reason,
          log,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Dependencies isolated for ${target}`,
                  worktreePath: res.path,
                  strategies: res.isolated,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error isolating worktree: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

/**
 * Runs the MCP server over standard input and output (stdio).
 */
export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

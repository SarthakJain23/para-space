import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  handleCreateWorkspace,
  handleIsolateWorktree,
  handleListWorktrees,
  handleOpenWorkspace,
  handleRemoveWorkspace,
} from './mcpHandlers.js';

/**
 * Creates and configures the ParaSpace Model Context Protocol (MCP) server.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'paraspace',
    version: '0.1.4',
  });

  // 1. para_create_workspace
  server.registerTool(
    'para_create_workspace',
    {
      description:
        'Creates an isolated Git worktree or parallel multi-repository workspace for a branch with shared dependencies, dedicated dev port, and Peacock window theme.',
      inputSchema: {
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
    },
    handleCreateWorkspace,
  );

  // 2. para_open_workspace
  server.registerTool(
    'para_open_workspace',
    {
      description:
        'Opens an existing parallel multi-repository workspace or single worktree in VS Code by branch name, workspace name, or file path.',
      inputSchema: {
        target: z.string().describe('Branch name, workspace name, or .code-workspace file path'),
        cwd: z.string().optional().describe('Directory to search from (default: process.cwd())'),
      },
    },
    handleOpenWorkspace,
  );

  // 3. para_list_worktrees
  server.registerTool(
    'para_list_worktrees',
    {
      description:
        'Lists active Git worktrees, assigned dev server ports, and multi-repo workspaces. Optionally filter results by name, branch, repository, or path.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        cwd: z.string().optional().describe('Directory to check from (default: process.cwd())'),
        query: z
          .string()
          .optional()
          .describe(
            'Optional case-insensitive search across workspace and worktree names, branches, repositories, and paths',
          ),
      },
    },
    handleListWorktrees,
  );

  // 4. para_isolate_worktree
  server.registerTool(
    'para_isolate_worktree',
    {
      description:
        'Replaces shared dependency symlinks in a worktree with an independent copy (APFS CoW clone on macOS, fresh install elsewhere).',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        target: z.string().describe('Branch name, directory name or path of the worktree to isolate'),
        reason: z.string().optional().describe('Why the worktree diverged from main (recorded in context history)'),
        cwd: z.string().optional().describe('Repository directory (default: process.cwd())'),
      },
    },
    handleIsolateWorktree,
  );

  // 5. para_remove_workspace
  server.registerTool(
    'para_remove_workspace',
    {
      description:
        'Cleans up a secondary ParaSpace multi-repository workspace and/or Git worktree, safely unlinking shared dependencies first, releasing its assigned dev port, and keeping the main repository and Git branch commits intact unless deleteBranch is true.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        target: z.string().describe('Branch name, workspace name, worktree directory name, or path to remove'),
        deleteBranch: z
          .boolean()
          .optional()
          .describe('Also delete the Git branch associated with the removed worktree(s) (default: false)'),
        deleteWorkspaceFile: z
          .boolean()
          .optional()
          .describe(
            'When removing a multi-repository workspace, also delete the .code-workspace file from disk (default: true)',
          ),
        removeWorktrees: z
          .boolean()
          .optional()
          .describe('When removing a multi-repository workspace, also remove its member Git worktrees (default: true)'),
        force: z
          .boolean()
          .optional()
          .describe('Allow worktree cleanup even if the secondary worktree has local/untracked files'),
        cwd: z.string().optional().describe('Directory to execute in (default: process.cwd())'),
      },
    },
    handleRemoveWorkspace,
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

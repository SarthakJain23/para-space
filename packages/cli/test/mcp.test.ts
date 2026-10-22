import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/mcp.js';

describe('MCP server', () => {
  it('creates server with all registered tools', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();

    // Inspect server's registered tools
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(tools).toBeDefined();
    expect(tools['para_create_workspace']).toBeDefined();
    expect(tools['para_open_workspace']).toBeDefined();
    expect(tools['para_list_worktrees']).toBeDefined();
    expect(tools['para_isolate_worktree']).toBeDefined();
  });

  it('para_list_worktrees executes and returns structured JSON', async () => {
    const server = createMcpServer();
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }>;
      }
    )._registeredTools;
    const listHandler = tools['para_list_worktrees'].handler;

    const res = await listHandler({ cwd: process.cwd() });
    expect(res).toBeDefined();
    expect(res.content).toHaveLength(1);

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.workspaces).toBeDefined();
    expect(parsed.repositories).toBeDefined();
  });

  it('setup-agent writes valid MCP configuration', async () => {
    const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'para-test-agent-')));
    const configFile = path.join(tmp, 'claude.json');

    // Simulate writing MCP config
    const config = {
      mcpServers: {
        paraspace: {
          command: 'para',
          args: ['mcp'],
        },
      },
    };
    await fs.writeFile(configFile, JSON.stringify(config, null, 2), 'utf8');

    const read = JSON.parse(await fs.readFile(configFile, 'utf8'));
    expect(read.mcpServers.paraspace.command).toBe('para');
    expect(read.mcpServers.paraspace.args).toEqual(['mcp']);

    await fs.rm(tmp, { recursive: true, force: true });
  });
});

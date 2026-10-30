import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureClaudePermissions } from '../src/commands/agent.js';
import { createMcpServer } from '../src/mcp.js';

describe('MCP server', () => {
  it('creates server with all registered tools', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();

    // Inspect server's registered tools
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(tools).toBeDefined();
    expect(tools['para_create_workspace']).toBeDefined();
    expect(tools['para_add_repo_to_workspace']).toBeDefined();
    expect(tools['para_open_workspace']).toBeDefined();
    expect(tools['para_list_worktrees']).toBeDefined();
    expect(tools['para_isolate_worktree']).toBeDefined();
    expect(tools['para_remove_workspace']).toBeDefined();
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

  it('para_list_worktrees filters results with a search query', async () => {
    const server = createMcpServer();
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }>;
      }
    )._registeredTools;
    const res = await tools['para_list_worktrees'].handler({
      cwd: process.cwd(),
      query: 'para-space-search-no-match',
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.workspaces).toEqual([]);
    expect(Object.values(parsed.repositories).every((rows) => Array.isArray(rows) && rows.length === 0)).toBe(true);
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

    const claudeSettingsFile = path.join(tmp, 'settings.json');
    await fs.writeFile(claudeSettingsFile, JSON.stringify({ model: 'opus', permissions: { allow: ['Bash'] } }), 'utf8');
    expect(await ensureClaudePermissions(claudeSettingsFile)).toBe(true);
    expect(await ensureClaudePermissions(claudeSettingsFile)).toBe(true);

    const settings = JSON.parse(await fs.readFile(claudeSettingsFile, 'utf8'));
    expect(settings.model).toBe('opus');
    expect(settings.permissions.allow).toEqual(['Bash', 'mcp__paraspace__*']);

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('para_add_repo_to_workspace adds mobile repo to an existing frontend + backend workspace', async () => {
    const { execFileSync } = await import('node:child_process');
    const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'para-test-mcp-add-')));
    const prevHome = process.env.PARA_SPACE_HOME;
    process.env.PARA_SPACE_HOME = path.join(tmp, 'home');

    try {
      const frontend = path.join(tmp, 'frontend');
      const backend = path.join(tmp, 'backend');
      const mobile = path.join(tmp, 'mobile');
      for (const dir of [frontend, backend, mobile]) {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: path.basename(dir) }), 'utf8');
        execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
        execFileSync('git', ['add', '.'], { cwd: dir });
        execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: dir });
      }

      const server = createMcpServer();
      const tools = (
        server as unknown as {
          _registeredTools: Record<string, { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }>;
        }
      )._registeredTools;

      const createRes = await tools['para_create_workspace'].handler({
        branch: 'feat/add-mobile',
        repos: [frontend, backend],
        cwd: tmp,
      });
      const created = JSON.parse(createRes.content[0].text);
      expect(created.worktrees).toHaveLength(2);

      // Add mobile by sibling name while cwd is inside frontend
      const addRes = await tools['para_add_repo_to_workspace'].handler({
        repos: ['mobile'],
        target: 'feat/add-mobile',
        cwd: frontend,
      });
      const added = JSON.parse(addRes.content[0].text);
      expect(added.added).toHaveLength(1);
      expect(added.added[0].repo).toBe('mobile');
      expect(added.repos.map((r: { repo: string }) => r.repo)).toEqual(['frontend', 'backend', 'mobile']);

      const wsContent = JSON.parse(await fs.readFile(added.workspaceFile, 'utf8'));
      expect(wsContent.folders.map((f: { name: string }) => f.name)).toEqual(['frontend', 'backend', 'mobile']);
    } finally {
      if (prevHome === undefined) delete process.env.PARA_SPACE_HOME;
      else process.env.PARA_SPACE_HOME = prevHome;
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

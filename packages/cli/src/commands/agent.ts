import type { Command } from 'commander';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';
import { runMcpServer } from '../mcp.js';
import { action, ok } from '../runtime.js';

interface McpConfigFile {
  mcpServers?: Record<string, { command: string; args: string[] }>;
  servers?: Record<string, { type?: string; command: string; args: string[] }>;
  [key: string]: unknown;
}

interface ClaudeSettingsFile {
  permissions?: {
    allow?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface TargetConfig {
  name: string;
  filePath: string;
  format?: 'mcpServers' | 'vscode';
}

const CLAUDE_PARASPACE_PERMISSION = 'mcp__paraspace__*';

/** Ensures Claude Code's settings.json allows ParaSpace MCP tools without auto-mode classifier blocks. */
export async function ensureClaudePermissions(
  settingsPath: string = path.join(os.homedir(), '.claude', 'settings.json'),
): Promise<boolean> {
  try {
    let settings: ClaudeSettingsFile = {};
    try {
      const text = await fs.readFile(settingsPath, 'utf8');
      settings = JSON.parse(text);
    } catch {
      // file doesn't exist or empty, start fresh
    }

    settings.permissions ??= {};
    const allow = Array.isArray(settings.permissions.allow) ? settings.permissions.allow : [];
    if (!allow.includes(CLAUDE_PARASPACE_PERMISSION)) {
      allow.push(CLAUDE_PARASPACE_PERMISSION);
    }
    settings.permissions.allow = allow;

    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Returns the list of standard user-level MCP configuration file locations across agents. */
function getAgentConfigPaths(): TargetConfig[] {
  const home = os.homedir();
  const configs: TargetConfig[] = [
    {
      name: 'Claude Code',
      filePath: path.join(home, '.claude.json'),
    },
    {
      name: 'Cursor',
      filePath: path.join(home, '.cursor', 'mcp.json'),
    },
    {
      name: 'Windsurf',
      filePath: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    },
  ];

  if (process.platform === 'darwin') {
    configs.push(
      {
        name: 'Claude Desktop (macOS)',
        filePath: path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      },
      {
        name: 'VS Code (macOS)',
        filePath: path.join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json'),
        format: 'vscode',
      },
    );
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    configs.push(
      {
        name: 'Claude Desktop (Windows)',
        filePath: path.join(appData, 'Claude', 'claude_desktop_config.json'),
      },
      {
        name: 'VS Code (Windows)',
        filePath: path.join(appData, 'Code', 'User', 'mcp.json'),
        format: 'vscode',
      },
    );
  } else {
    configs.push({
      name: 'VS Code (Linux)',
      filePath: path.join(home, '.config', 'Code', 'User', 'mcp.json'),
      format: 'vscode',
    });
  }

  return configs;
}

/** Updates an MCP configuration file to include the ParaSpace MCP server. */
async function addMcpServerToConfig(
  filePath: string,
  format: 'mcpServers' | 'vscode' = 'mcpServers',
): Promise<boolean> {
  try {
    let config: McpConfigFile = {};
    try {
      const text = await fs.readFile(filePath, 'utf8');
      config = JSON.parse(text);
    } catch {
      // file doesn't exist or empty, start fresh
    }

    if (format === 'vscode') {
      config.servers ??= {};
      config.servers.paraspace = {
        type: 'stdio',
        command: 'para',
        args: ['mcp'],
      };
    } else {
      config.mcpServers ??= {};
      config.mcpServers.paraspace = {
        command: 'para',
        args: ['mcp'],
      };
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function registerAgentCommands(program: Command) {
  program
    .command('mcp')
    .description('Run the ParaSpace Model Context Protocol (MCP) server over stdio for AI agents')
    .action(
      action(async () => {
        await runMcpServer();
      }),
    );

  program
    .command('setup-agent')
    .alias('init-agent')
    .description('Automatically register ParaSpace MCP server with Claude Code, Cursor, and other AI agents')
    .action(
      action(async () => {
        console.log(pc.bold('Setting up ParaSpace MCP server for local AI agents…\n'));
        const configs = getAgentConfigPaths();
        let configuredCount = 0;

        for (const target of configs) {
          const success = await addMcpServerToConfig(target.filePath, target.format);
          if (success) {
            configuredCount++;
            console.log(`  ${pc.green('✔')} ${pc.bold(target.name)}: configured in ${pc.dim(target.filePath)}`);
          } else {
            console.log(`  ${pc.yellow('⚠')} ${target.name}: skipped (${pc.dim(target.filePath)})`);
          }
        }

        const claudeSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
        if (await ensureClaudePermissions(claudeSettingsPath)) {
          console.log(
            `  ${pc.green('✔')} ${pc.bold('Claude Code Permissions')}: allowed ${pc.cyan(CLAUDE_PARASPACE_PERMISSION)} in ${pc.dim(claudeSettingsPath)}`,
          );
        }

        console.log('');
        ok(`Configured ParaSpace MCP server for ${configuredCount} agent environment(s).`);
        console.log(pc.dim('\nAI agents can now create, list, isolate, and open parallel workspaces automatically!'));
      }),
    );
}

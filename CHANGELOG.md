# Changelog

All notable changes to **ParaSpace** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-23

### Added
- **Core Orchestration Engine (`@para-space/core`):**
  - Git worktree lifecycle management (`create`, `list`, `isolate`, `remove`, `config`, `check`) with automatic rollback on partial failures and file-locked state persistence (`~/.para-space/state.json`).
  - Zero-copy dependency sharing (`NodeStrategy` for `node_modules`, `PythonStrategy` for `.venv`, `EnvStrategy` for `.env` / `.env.local`) via absolute-path symlinks and Windows directory junctions.
  - Pluggable port allocation strategies (`offset`, `scan`, `pool`, `passthrough`) persisted per repository in `.para-space.json`.
  - Equal-lightness OKLCH Peacock window color generation (`workbench.colorCustomizations`) and opt-in IDE configuration.
  - Living context history ledger (`.para-space/context-history.md`) tracking worktree creation, configuration, and isolation decisions.
- **CLI (`@para-space/cli`):**
  - Commands: `para create`, `para workspace create|list|open`, `para list`, `para check`, `para isolate`, `para remove`, `para config`, `para mcp`, and `para setup-agent`.
  - Interactive terminal prompts via `@clack/prompts` and non-interactive script/agent execution via `--yes` and `--json`.
- **VS Code Extension (`para-space-vscode`):**
  - Activity bar views for **Worktrees** (multi-repo workspaces, repositories, worktrees, ports, link status) and **Context History**.
  - Status bar worktree/port indicator and Quick Switcher (`ParaSpace: List Worktrees`).
  - Searchable branch picker and multi-repository `.code-workspace` provisioning with automatic window launch.
  - Real-time manifest file watcher detecting `package.json`, lockfile, and Python manifest divergence with 1-click Breakaway Isolation (APFS Copy-on-Write clone on macOS, fresh install elsewhere).
- **Zero-Config AI Agent Integration:**
  - Native VS Code Language Model Tools (`para_create_workspace`, `para_open_workspace`, `para_list_worktrees`, `para_isolate_worktree`) for GitHub Copilot Chat.
  - Model Context Protocol (MCP) stdio server (`para mcp`) and 1-click global registration (`para setup-agent`) for Claude Code, Cursor, Windsurf, and Claude Desktop.

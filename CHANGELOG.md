# Changelog

All notable changes to **ParaSpace** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-24

### Added
- **Workspace Removal (`ParaSpace: Remove Workspace…` & `para workspace remove`):**
  - Remove tracked multi-repository workspaces from the VS Code sidebar context menu or CLI (`para workspace rm <target>`), with the choice to keep the `.code-workspace` file on disk (suppressed from auto-discovery via `ignoredWorkspaces`) or move/delete the file.
- **Search & Filtering Across Workspaces and Worktrees:**
  - Added `query` filtering to `para_list_worktrees` in both the MCP server (`para mcp`) and VS Code Language Model Tools (Copilot Chat).
  - Added `[query]` and `-q, --query <query>` filtering to `para list` and `para workspace list`, and enabled detail/description matching in VS Code workspace pickers.
  - Added multi-repo parent container directory fallback to `para list` and `para check`.
- **Deprecated API Enforcement (`pnpm lint`):**
  - Added type-aware ESLint rule `@typescript-eslint/no-deprecated` in CI and migrated MCP tool registrations to `McpServer.registerTool()`.

### Fixed
- **Cross-Repository Worktree Resolution & Removal:**
  - Fixed `resolveWorktree`, `paraSpace.removeWorktree`, and `paraSpace.isolateWorktree` in multi-repository workspaces so removing or isolating a worktree in a secondary repository resolves against its owning repository root instead of failing with `No worktree matches ...`.
- **Multi-Repo Manifest Watcher & Active Repository Tracking:**
  - Fixed `watchManifests` to monitor and isolate diverged worktrees across all repositories in a multi-root workspace.
  - Fixed `WorktreeStore.root` to resolve the active repository from linked worktrees and updated the status bar on editor tab switches without triggering redundant Git reloads.
- **Stale Workspace Member Pruning:**
  - `getWorkspaceRecords` now prunes deleted member worktree paths from recorded workspaces and removes workspace records when no live member worktrees remain.

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

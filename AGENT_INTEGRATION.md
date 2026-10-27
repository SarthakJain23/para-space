# ParaSpace — AI Coding Agent Integration Guide

How AI coding agents (such as **Claude Code**, **GitHub Copilot**, **Cursor**, **Windsurf**, and **Aider**) can orchestrate parallel worktrees and multi-repository workspaces on behalf of developers using ParaSpace.

---

## 1. Why Agents Use ParaSpace

When coding agents work on tickets or features:
1. **No checkout collisions:** The agent works on its own branch in an isolated Git worktree (`~/.para-space/worktrees/<project>/<repo>-<branch>`) without interrupting the developer or stashing working tree edits.
2. **Instant dependency availability:** Dependencies (`node_modules`, `.venv`) and environment variables (`.env`, `.env.local`) are symlinked from the main repository in milliseconds without running slow `npm install` or `pip install`.
3. **Dedicated dev server ports:** ParaSpace allocates non-colliding ports via `.env.local` so parallel dev servers can run simultaneously.
4. **Distinct window coloring:** Each worktree or workspace receives an OKLCH window theme (Peacock pattern) in `.vscode/settings.json` or `.code-workspace` so developers can visually identify which agent is working in which window.
5. **Living Context Ledger:** Every creation, configuration shift, or isolation appends an entry to `.para-space/context-history.md` preserving ticket requirements, decisions made, and problems solved.

---

## 2. Command Reference for Agents (Terminal & Bash Tools)

All CLI commands support non-interactive mode via `--yes` (`-y`) and machine-readable output via `--json`. When executed by an agent, commands never block or prompt.

### A. Single-Repository Worktrees

| Task | Command |
| :--- | :--- |
| **Create worktree** | `para create <branch> --base main --yes -r "<ticket-or-task-description>" --json` |
| **List worktrees & ports** | `para list --json` |
| **Check divergence** | `para check --json` |
| **Isolate dependencies** | `para isolate <branch> -r "<reason-for-divergence>"` |
| **Remove worktree** | `para remove <branch> --delete-branch` |

**Example agent call:**
```bash
para create feat/TRI-7402 --base main --yes -r "Implement Visa Request Form" --json
```

**JSON response:**
```json
{
  "mainRoot": "/Users/sarthak/Desktop/Tripare/Business-Travel-Booking-Dashboard",
  "path": "/Users/sarthak/.para-space/worktrees/Tripare/Business-Travel-Booking-Dashboard-feat-TRI-7402",
  "branch": "feat/TRI-7402",
  "createdBranch": true,
  "port": 3003,
  "color": "#7855c3",
  "strategies": ["NodeStrategy", "EnvStrategy"],
  "links": [
    "/Users/sarthak/.para-space/worktrees/Tripare/Business-Travel-Booking-Dashboard-feat-TRI-7402/node_modules",
    "/Users/sarthak/.para-space/worktrees/Tripare/Business-Travel-Booking-Dashboard-feat-TRI-7402/.env"
  ]
}
```

---

### B. Multi-Repository Workspaces (e.g. Frontend + Backend)

When a project spans multiple repositories in a workspace or parent directory:

| Task | Command |
| :--- | :--- |
| **Create workspace** | `para workspace create <branch> --yes -r "<task-description>" --json` |
| **Create with explicit repos** | `para workspace create <branch> --repo ./frontend --repo ./backend --yes -r "<task-description>" --json` |
| **List workspaces** | `para workspace list --json` |
| **Open workspace in VS Code** | `para workspace open <branch>` *(or `code <workspaceFile>`)* |
| **Remove workspace** | `para workspace remove <branch> --remove-worktrees --delete-file --yes` |

**Example agent call:**
```bash
para workspace create feat/TRI-7402 --yes -r "Visa request API & frontend implementation" --json
```

**JSON response:**
```json
{
  "workspaceFile": "/Users/sarthak/.para-space/workspaces/Tripare-feat-TRI-7402.code-workspace",
  "worktrees": [
    {
      "mainRoot": "/Users/sarthak/Desktop/Tripare/Business-Travel-Booking-Dashboard",
      "path": "/Users/sarthak/.para-space/worktrees/Tripare/Business-Travel-Booking-Dashboard-feat-TRI-7402",
      "branch": "feat/TRI-7402",
      "port": 3003
    },
    {
      "mainRoot": "/Users/sarthak/Desktop/Tripare/tp-api",
      "path": "/Users/sarthak/.para-space/worktrees/Tripare/tp-api-feat-TRI-7402",
      "branch": "feat/TRI-7402",
      "port": 3003
    }
  ]
}
```

**Open the workspace in VS Code:**
```bash
para workspace open feat/TRI-7402
```

---

---

## 3. Zero-Config Native Integrations (No Repo Pollution)

ParaSpace integrates directly at the **IDE and Environment level**. You never need to commit custom instruction files into user repositories.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        AI CODING AGENTS                                │
│   GitHub Copilot  │  Claude Code  │  Cursor  │  Windsurf  │  Devin     │
└─────────┬──────────────────┬─────────────────────┬─────────────────────┘
          │                  │                     │
          ▼                  ▼                     ▼
┌──────────────────┐ ┌───────────────┐ ┌─────────────────────────────────┐
│ Tier 1:          │ │ Tier 2:       │ │ Tier 3:                         │
│ VS Code LM Tools │ │ Model Context │ │ Headless CLI Tools              │
│ (Copilot Chat)   │ │ Protocol(MCP) │ │ (`--yes` & `--json`)            │
└──────────────────┘ └───────────────┘ └─────────────────────────────────┘
```

### Tier 1: VS Code Language Model Tools API (For GitHub Copilot)

The ParaSpace extension registers native tools via VS Code's Language Model Tools API:
- `para_create_workspace`: Creates a parallel worktree or multi-repo workspace.
- `para_open_workspace`: Opens an existing workspace in VS Code.
- `para_list_worktrees`: Lists active worktrees and workspaces with ports; accepts an optional `query` to filter by name, branch, repository, or path.
- `para_isolate_worktree`: Safely breaks away shared dependencies when manifests diverge.
- `para_remove_workspace`: Removes a parallel multi-repo workspace and/or Git worktree, freeing its port and optionally deleting the branch and `.code-workspace` file.

**User Experience:**
When a user installs the **ParaSpace** extension from the Marketplace:
1. GitHub Copilot Chat automatically sees ParaSpace tools in its tool registry.
2. The user can ask Copilot: *"Copilot, set up a parallel workspace for ticket TRI-7402 across frontend and backend"*
3. Copilot invokes `para_create_workspace` directly. No project files or prompts required.

---

### Tier 2: Model Context Protocol (MCP) (For Claude Code, Cursor, Windsurf)

ParaSpace includes a built-in MCP server that communicates over `stdio`:
```bash
para mcp
```

#### One-Click Machine Setup (`para setup-agent`)
Run once on your machine:
```bash
para setup-agent
```
This automatically configures the ParaSpace MCP server in:
- `~/Library/Application Support/Code/User/mcp.json` (VS Code / GitHub Copilot)
- `~/.claude.json` (Claude Code)
- `~/.cursor/mcp.json` (Cursor)
- `~/.codeium/windsurf/mcp_config.json` (Windsurf)
- `~/Library/Application Support/Claude/claude_desktop_config.json` (Claude Desktop)

Once configured, Claude Code or Cursor automatically knows all ParaSpace tools in **any** repository on your machine without modifying project files.

---

### Tier 3: Programmatic VS Code Command API

In VS Code extension host environments, agents can also execute ParaSpace commands programmatically:

```typescript
await vscode.commands.executeCommand('paraSpace.createWorktree', {
  branch: 'feat/TRI-7402',
  base: 'main',                          // optional, defaults to HEAD
  requirement: 'Visa request flow',      // optional, recorded in context ledger
  repos: ['/path/to/web', '/path/to/api'], // optional, defaults to included repos
  ide: 'yes'                             // optional, applies Peacock window coloring
});
```

---

## 4. Optional: Repository-Level Instructions (Project-Specific Overrides)

If a team explicitly prefers documenting workflows in their repo, they can add optional instructions:

### For Claude Code (`CLAUDE.md`)
```markdown
## Worktree & Workspace Management
- When asked to start a new feature or ticket, use `para`:
  - Multi-repo workspace: `para workspace create <branch> --yes -r "<ticket-description>" --json`
  - Single-repo worktree: `para create <branch> --base main --yes -r "<ticket-description>" --json`
- Open workspace: `para workspace open <branch>`
- Clean up when done: `para remove <branch> --delete-branch`
```

### For GitHub Copilot (`.github/copilot-instructions.md`)
```markdown
## ParaSpace Workspaces
- Use `para workspace create <branch> --yes -r "<task>" --json` to provision parallel workspaces.
- Use `para workspace open <branch>` to open the workspace.
```

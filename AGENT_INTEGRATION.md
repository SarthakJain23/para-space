# ParaSpace — AI Coding Agent Integration Guide

How AI coding agents (such as **Claude Code**, **GitHub Copilot**, **Cursor**, **Windsurf**, and **Aider**) can orchestrate parallel worktrees and multi-repository workspaces on behalf of developers using ParaSpace.

---

## 1. Why Agents Use ParaSpace

When coding agents work on tickets or features:
1. **No checkout collisions:** The agent works on its own branch in an isolated Git worktree (`../<repo>-<branch>`) without interrupting the developer or stashing working tree edits.
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
  "path": "/Users/sarthak/Desktop/Tripare/Business-Travel-Booking-Dashboard-feat-TRI-7402",
  "branch": "feat/TRI-7402",
  "createdBranch": true,
  "port": 3003,
  "color": "#7855c3",
  "strategies": ["NodeStrategy", "EnvStrategy"],
  "links": [
    "/Users/sarthak/Desktop/Tripare/Business-Travel-Booking-Dashboard-feat-TRI-7402/node_modules",
    "/Users/sarthak/Desktop/Tripare/Business-Travel-Booking-Dashboard-feat-TRI-7402/.env"
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

**Example agent call:**
```bash
para workspace create feat/TRI-7402 --yes -r "Visa request API & frontend implementation" --json
```

**JSON response:**
```json
{
  "workspaceFile": "/Users/sarthak/Desktop/Tripare/Untitled-feat-TRI-7402.code-workspace",
  "worktrees": [
    {
      "mainRoot": "/Users/sarthak/Desktop/Tripare/Business-Travel-Booking-Dashboard",
      "path": "/Users/sarthak/Desktop/Tripare/Business-Travel-Booking-Dashboard-feat-TRI-7402",
      "branch": "feat/TRI-7402",
      "port": 3003
    },
    {
      "mainRoot": "/Users/sarthak/Desktop/Tripare/tp-api",
      "path": "/Users/sarthak/Desktop/Tripare/tp-api-feat-TRI-7402",
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

## 3. VS Code API & Commands (For VS Code Extension Agents & Copilot Chat)

In VS Code extension host environments, agents can execute ParaSpace commands programmatically via `vscode.commands.executeCommand`:

### Create Worktree or Multi-Repo Workspace
```typescript
await vscode.commands.executeCommand('paraSpace.createWorktree', {
  branch: 'feat/TRI-7402',
  base: 'main',                          // optional, defaults to HEAD
  requirement: 'Visa request flow',      // optional, recorded in context ledger
  repos: ['/path/to/web', '/path/to/api'], // optional, defaults to included repos
  ide: 'yes'                             // optional, applies Peacock window coloring
});
```
*Note: Passing `branch` causes the command to run completely non-interactively, provisions the worktrees, creates the `.code-workspace` file (if multi-repo), and opens the new window automatically.*

### Open Recorded Workspace
```typescript
await vscode.commands.executeCommand('paraSpace.openWorkspace', '/path/to/Untitled-feat-TRI-7402.code-workspace');
```

---

## 4. Agent Instruction Templates

You can add instructions to your projects so that your AI assistants automatically use ParaSpace when asked to start a task or create a workspace.

### For Claude Code (`CLAUDE.md` or `~/.claude/instructions.md`)
```markdown
## Worktree & Workspace Management
- When asked to start a new feature, bugfix, or parallel ticket, use `para`:
  - For single repository: `para create <branch> --base main --yes -r "<ticket-description>" --json`
  - For multi-repository workspaces: `para workspace create <branch> --yes -r "<ticket-description>" --json`
- After creating, you can open the workspace for the user: `para workspace open <branch>`
- Never install packages directly into shared symlinks if package manifests diverge; run `para isolate <branch>` first.
- When finished and verified, clean up with `para remove <branch> --delete-branch`.
```

### For GitHub Copilot (`.github/copilot-instructions.md`)
```markdown
## Parallel Workspaces with ParaSpace
- When the user asks to create or open a workspace or worktree for a branch or feature, use the `para` CLI:
  - Single repo: `para create <branch> --yes -r "<description>" --json`
  - Multi repo: `para workspace create <branch> --yes -r "<description>" --json`
  - Open workspace: `para workspace open <branch>`
- Do not run interactive prompts in scripts; always supply `--yes` and `--json`.
```

### For Cursor (`.cursorrules` or `.cursor/rules/paraspace.mdc`)
```markdown
---
description: Parallel Git worktree and multi-repo workspace management with ParaSpace
globs: *
---
- Use `para workspace create <branch> --yes -r "<reason>"` to provision parallel multi-repo workspaces.
- Use `para create <branch> --yes -r "<reason>"` to provision single-repo worktrees.
- Use `para workspace open <branch>` to open the multi-root workspace file in VS Code.
```

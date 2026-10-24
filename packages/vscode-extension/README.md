# ParaSpace for VS Code

**Parallel workspace orchestrator for multi-agent and multi-task IDE workflows.**

Spin up isolated Git worktrees and multi-repository workspaces in milliseconds—with **zero-duplication dependency sharing** (`node_modules`, `.venv`), **per-worktree dev server ports** (`.env.local`), **OKLCH Peacock window coloring**, **manifest divergence safety**, and **native GitHub Copilot Language Model Tools**.

---

## Key Features

- **Instant Parallel Worktrees:** Create a branch worktree (`../<repo>-<branch>`) in 1 click without stashing or waiting for `npm install` / `pip install`.
- **Multi-Repository Workspaces:** Select multiple repositories (e.g., `frontend` + `backend`), provision matching branch worktrees across all of them, and launch a pre-configured, color-themed `.code-workspace` window automatically.
- **Zero-Copy Dependency Sharing:** Symlinks `node_modules`, `.venv`, and `.env` from your main checkout (using directory junctions on Windows).
- **Per-Worktree Dev Ports:** Allocates dedicated ports (`PORT`, `VITE_PORT`, etc.) into `.env.local` using pluggable strategies (`offset`, `scan`, `pool`, `passthrough`) so parallel dev servers never collide.
- **Manifest Watcher & 1-Click Breakaway Isolation:** Automatically detects when `package.json`, lockfiles, or Python manifests diverge from the main checkout and offers 1-click **Isolate Dependencies** (using instant APFS Copy-on-Write clones on macOS).
- **OKLCH Window Coloring:** Opt-in, equal-lightness title bar and status bar themes so you can immediately tell parallel windows apart.
- **Living Context History Ledger:** Records why each worktree was created, configured, or isolated in `.para-space/context-history.md` and surfaces it in the **Context History** sidebar view.
- **Native GitHub Copilot Tools:** Exposes `para_create_workspace`, `para_open_workspace`, `para_list_worktrees`, and `para_isolate_worktree` to GitHub Copilot Chat out of the box—no repo configuration files needed.

---

## Views & Commands

### Sidebar Views (ParaSpace Activity Bar)
1. **Worktrees:** View all active multi-repo workspaces, repositories, and linked worktrees with their assigned port, dependency sharing state (`shared` / `isolated` / `diverged`), and 1-click actions to open in a new window, isolate dependencies, or remove.
2. **Context History:** Browse the chronological decision ledger across your repositories and open `.para-space/context-history.md` in the editor.

### Status Bar & Quick Switcher
Click the **ParaSpace status bar item** (showing your current branch, assigned port, and window color indicator) to open the **Quick Switcher**:
- Switch to any active worktree or multi-repo workspace in a new window.
- Create a new worktree or multi-repo workspace.

### Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
| Command | Description |
| :--- | :--- |
| **ParaSpace: Create Worktree…** | Search/pick an existing branch or create a new branch across one or more repositories |
| **ParaSpace: List Worktrees** | Open the Quick Switcher for worktrees and multi-repo workspaces |
| **ParaSpace: Open Workspace…** | Reopen a tracked multi-repo workspace or browse for a `.code-workspace` file on disk |
| **ParaSpace: Configure Port Strategy…** | Configure `offset`, `scan`, `pool`, or `passthrough` port allocation in `.para-space.json` |
| **ParaSpace: Select Repositories to Include…** | Filter which repositories appear in the ParaSpace sidebar |
| **ParaSpace: Open Context History in Editor** | Open `.para-space/context-history.md` |
| **ParaSpace: Refresh** | Refresh worktrees, workspaces, and manifest divergence status |

---

## Multi-Repository Workspace Workflow

ParaSpace supports full multi-repository workflows (for example, `frontend` + `backend` repositories inside a parent directory or multi-root workspace):

1. **Open Any Repo, Workspace, or Parent Container Folder:**
   - Even if you open a parent folder that is not a Git repository itself, ParaSpace automatically scans immediate child folders and `.code-workspace` files to discover all repositories.
2. **Create a Parallel Multi-Repo Workspace (`ParaSpace: Create Worktree…`):**
   - Select multiple repositories in the searchable multi-select picker (all included repositories are pre-checked by default).
   - Choose **Use a shared branch** (check out an existing shared branch or create a new branch across all selected repos) or **Choose branches per repository (Advanced)**.
   - Review the summary and confirm. ParaSpace provisions each repository's worktree, generates a `.code-workspace` file with top-level OKLCH Peacock window coloring, and **automatically launches the new multi-root window**.
   - If any repository fails during creation, previously created worktrees in that batch are automatically rolled back.
3. **Reopen & Switch Multi-Repo Workspaces Anytime:**
   - **Sidebar (`Worktrees` view):** Active multi-repo workspaces appear at the top as expandable `Workspace` nodes—click the inline **Open in New Window** icon to launch, or expand to inspect member repository worktrees.
   - **Quick Switcher (`ParaSpace: List Worktrees` / Status Bar):** Multi-repo workspaces appear right below *Create Worktree…* as `$(root-folder) [Workspace] <branch>`.
   - **Open or Browse (`ParaSpace: Open Workspace…`):** Type to search tracked or auto-discovered workspaces by their displayed details, or pick **Browse for workspace file…** to import and open any `.code-workspace` file from disk.
   - **Remove:** Right-click a workspace node and choose **Remove Workspace…** to remove its ParaSpace record while keeping the file, or explicitly move the file to Trash.
   - **Filter Repositories (`ParaSpace: Select Repositories to Include…`):** Choose which repositories are shown in the sidebar views.

---

## Using with GitHub Copilot Chat

With the extension installed, ask GitHub Copilot in Agent mode:
> *"Create a parallel workspace for branch `feat/TK-101` with requirement 'Auth redesign' and open it."*

Copilot automatically invokes ParaSpace's built-in Language Model Tools (`para_create_workspace`, `para_open_workspace`, `para_list_worktrees`, `para_isolate_worktree`).

---

## Companion CLI (`@para-space-dev/cli`)

Prefer the terminal or want MCP integration for Claude Code, Cursor, or Windsurf? Install the companion CLI using your preferred package manager:

```bash
# npm
npm install -g @para-space-dev/cli

# pnpm
pnpm add -g @para-space-dev/cli

# yarn
yarn global add @para-space-dev/cli

# bun
bun add -g @para-space-dev/cli

# Register MCP server with Claude Code, Cursor, Windsurf & Claude Desktop
para setup-agent
```

---

## Requirements

- **Git** ≥ 2.31
- **VS Code** ≥ 1.90.0

## License

[MIT](https://github.com/SarthakJain23/para-space/blob/main/LICENSE)

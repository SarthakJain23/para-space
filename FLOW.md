# ParaSpace — System Flows

How ParaSpace behaves, step by step, for each operation. This describes the **current intended** behavior; it is rewritten in place whenever behavior changes, while the reasons live in [DECISIONS.md](DECISIONS.md).

**How to update:** after any change that alters a flow, edit the affected section, bump its `Last updated` line, and reference the decision ID that caused it. Add a row to the changelog at the bottom.

Implementation status: §1–6 are **Implemented** (Phase 1: `packages/core` + `packages/cli`; Phase 2: `packages/vscode-extension`; Phase 3: Manifest Watchers & Divergence Safety). Phase 4 (Monorepo & Ecosystem Expansion) is Planned.

---

## 0. Component Map

```text
para CLI ──┐   packages/core/src/commands/        ┌── Git Engine            git.ts            (git worktree add/list/remove/prune)
 cli/src/   │   config.ts   (first-run setup)      ├── Framework Detector    frameworks/       (Node / Python / Env, kind: dependencies|config)
 commands/* ├─► create.ts   list.ts                ├── Dependency Linker     link.ts           (absolute symlinks, junctions, CoW clone)
 runtime.ts │   isolate.ts  remove.ts ─────────────┼── Port & Env Allocator  ports/, envfile.ts (offset / scan / pool / passthrough)
VS Code ext ┘   resolve.ts  (find worktree)        ├── Git ignore helper     ignore.ts         (info/exclude, .gitignore)
 vscode-extension/src/                             ├── IDE Configurator      ide.ts, colors.ts (opt-in .vscode/settings.json)
                                                   ├── Context Logger        ledger.ts         (.para-space/context-history.md)
                                                   ├── State Store           state.ts          (~/.para-space/state.json)
                                                   └── util/                 exec, fs, format, lock  (shared helpers; lock = state.lock)
```

Front-ends inject a Prompter; with none (agents, --yes, no TTY) core never prompts (D-020).

Files ParaSpace reads/writes:

| File | Scope | Purpose |
| :--- | :--- | :--- |
| `.para-space.json` | Repo (local) | Port strategy, base port, env keys, optional `portPool` (D-004, D-015, D-051) |
| `.para-space/context-history.md` | Repo (local) | Living decision ledger (D-007, D-051) |
| `~/.para-space/state.json` | Machine | Worktrees, index, ports, links, colors, multi-repo `workspaces`, and `ignoredWorkspaces`; atomic writes; `PARA_SPACE_HOME` overrides (D-010, D-022, D-041, D-048) |
| `~/.para-space/worktrees/<project>/<repo>-<slug>` | Machine | Centralized directory where ParaSpace provisions linked Git worktrees (D-049) |
| `~/.para-space/workspaces/<name>-<slug>.code-workspace` | Machine | Centralized multi-repo VS Code workspace file with member worktree folders and top-level OKLCH Peacock `settings` (D-038, D-039, D-040, D-049) |
| `<worktree>/.env` | Worktree | Symlink to main's `.env` (D-013) |
| `<worktree>/.env.local` | Worktree | Own copy of main's `.env.local` + assigned port(s) (D-013) |
| `$GIT_COMMON_DIR/info/exclude` | Repo (local) | Patterns that hide ParaSpace's metadata (`.para-space/`, `.para-space.json`) and links from git (D-019, D-051) |
| `<worktree>/.vscode/settings.json` | Worktree | Colors + interpreter path, only with consent (D-006) |

---

## 1. Create Worktree — `para create <branch> [--base <ref>]`
_Status: Implemented · Last updated: 2026-10-29 · Decisions: D-001, D-002, D-004, D-005, D-006, D-007, D-009, D-013, D-015–D-020, D-022, D-027, D-037, D-049, D-051_

Flags: `--port-strategy`, `--base-port`, `--port-pool` (first run only), `--ide` / `--no-ide`, `-r/--requirement <text>`, `-y/--yes`, `--json`.

```mermaid
flowchart TD
    A[para create branch --base main] --> B{.para-space.json exists?}
    B -- No --> C[Default to offset strategy silently<br/>or use --port-strategy flag]
    C --> D[Write .para-space.json<br/>exclude .para-space/ & .para-space.json in info/exclude<br/>ledger entry]
    B -- Yes --> E[Load config & ensure info/exclude]
    D --> E
    E --> F[Sync base branch with origin<br/>git worktree add in ~/.para-space/worktrees/...]
    F --> S[Under state.lock: pick index, allocate port,<br/>write placeholder record]
    S --> G[Detect strategies in main repo]
    G --> H[Symlink node_modules / .venv / .env<br/>copy .env.local]
    H --> H2[Add links to info/exclude]
    H2 --> J[Upsert reserved port into envKeys in .env.local]
    J --> K{--ide, --no-ide, or prompt consent}
    K -- Yes --> L[Merge color + interpreter into .vscode/settings.json]
    K -- No --> M[Skip]
    L --> N[Complete record in state.json: links, color]
    M --> N
    N --> O[Append ledger entry]
    F -. any later step fails .-> R[Rollback: unlink, worktree remove --force,<br/>delete branch if created, drop reservation]
```

1. Resolve the **main** repo root via `git rev-parse --git-common-dir` (works from inside any worktree). The target is `~/.para-space/worktrees/<project-slug>/<repo>-<slug>` (D-049), and it fails if that path already exists.
2. **First run:** if `.para-space.json` is missing, use `--port-strategy` or default to `offset` silently without interrupting the user (D-037). `envKeys` = `PORT` plus strategy defaults (`VITE_PORT` for Vite). Exclude `/.para-space/` and `/.para-space.json` via `$GIT_COMMON_DIR/info/exclude` (D-051) and write a ledger entry. (Interactive port strategy configuration is available on-demand via `para config` / `paraSpace.configureRepo`).
3. **Sync base branch & checkout (D-049):** if `<branch>` already exists locally, `git worktree add <path> <branch>` checks it out. Otherwise, `syncBaseBranch()` fetches `<base>` (or the current branch if `--base` was omitted) from `origin`, fast-forwards the local base branch (`git pull --ff-only` in its checked-out worktree or `git fetch origin <base>:<base>`), and runs `git worktree add --no-track -b <branch> <path> origin/<base>`.
3a. **Reserve a slot (D-027):** while holding `~/.para-space/state.lock`, take `worktreeIndex` = lowest unused index ≥ 1, allocate a port (`assignedPorts` = ports in state + `basePort`), and write a placeholder record. Concurrent creates therefore never share an index or port. This happens after `git worktree add` so a concurrent `list` doesn't prune the placeholder.
4. For each detected `FrameworkStrategy`, call `linkDependencies()`. Node links `node_modules` (skipped for Yarn PnP). Python links `.venv`. Env links `.env` and copies `.env.local`. Existing paths in the worktree (e.g. a tracked `.env`) are left alone.
5. Write root-anchored patterns for the links and `.env.local` to `$GIT_COMMON_DIR/info/exclude`.
6. Write the reserved port to every `envKeys` entry in the worktree's `.env.local` (skipped for `passthrough`).
7. IDE settings: the index's palette color (D-034). The title bar and status bar get the color with white text; the inactive title bar and borders get its solid deeper shade; status bar hover gets its lighter shade; the activity bar keeps the theme and only gets a colored active marker and badge. Plus `configureIdeSettings()` (Python interpreter path → `<worktree>/.venv/bin/python`). Written only with `--ide` or interactive consent, merged into the existing JSONC settings.
8. Complete the reserved record with `links` and `color`, then append a ledger entry (the requirement comes from `--requirement`).
9. If steps 3a–8 fail, roll back (D-022), which also removes the reservation.

Every state write (create, isolate, remove, list's prune) goes through `updateRepoState`, which holds `state.lock` for the whole read-modify-write. Waiters retry for up to 10 s. A lock whose process is dead, or that is older than 30 s, is reclaimed (D-027).

---

---

## 1a. Multi-Repository Workspace — `para workspace create [branch]` (`ws`)
_Status: Implemented · Last updated: 2026-10-27 · Decisions: D-001, D-022, D-037, D-038, D-039, D-041, D-042, D-048, D-049_

Subcommands: `create` (default), `open [target]`, `list [query]` (`ls`), `remove <target>` (`rm`).
Flags for `create`: `--repo <paths...>`, `-b/--base <ref>`, `--per-repo`, `-r/--requirement <text>`, `--name <name>`, `--ide` / `--no-ide`, `-y/--yes`, `--json`.

1. **Repository discovery & selection:**
   - If `--repo <path...>` is given, resolves each path to its git main repository root.
   - Otherwise, discovers repository roots from `cwd`, any `.code-workspace` file in `cwd`, and immediate child directories via `discoverWorkspaceRepoRoots`.
   - When multiple repositories are discovered in interactive mode, prompts with a multi-select list (all checked by default). In non-interactive mode (`-y`), uses all discovered repositories.
2. **Branch planning:**
   - If `[branch]` argument is passed: checks existence across all selected repositories. If present in all, checks it out. If absent in all, creates it (using `--base` or prompting for base per repo). If present in only some, routes to per-repo confirmation or throws in non-interactive mode.
   - If no branch is passed: prompts user to choose between **Use a shared branch** (only branches common to all repos or new branch created across all) or **Choose branches per repository (Advanced)**.
3. **Review & Provisioning:**
   - Summarizes the plan and prompts for confirmation in interactive mode.
   - Provisions each repository sequentially via `createWorktree`.
   - If provisioning fails for any repository, all previously created worktrees are automatically rolled back with `removeWorktree` and rollback issues are reported (D-022, D-039).
4. **Workspace configuration file:**
   - Emits or updates a `.code-workspace` file inside `~/.para-space/workspaces/` pointing to the new worktree paths (preserving workspace settings from any existing workspace file in cwd) (D-049).
   - Injects the assigned OKLCH Peacock window theme into `.code-workspace` settings (D-040).
   - Saves a `WorkspaceRecord` into `state.json` under `workspaces` for 1-click reopening (D-041).
   - Prints output or returns JSON when `--json` is supplied.
5. **Workspace Opening, Listing & Removal:**
   - `para workspace open [target]`: opens a recorded or on-disk workspace in VS Code via `code <workspaceFile>`. Supports matching by branch, workspace name, or file path.
   - `para workspace list [query] [-q/--query <query>] [--json]`: lists all registered and discovered multi-repo workspaces with member repos, optionally filtered by query (D-048).
   - `para workspace remove <target> [--delete-file] [-y/--yes]`: removes a workspace record from ParaSpace, optionally deleting the `.code-workspace` file from disk or suppressing future auto-discovery via `ignoredWorkspaces` (D-048).

---

## 2. List Worktrees — `para list` (`ls`)
_Status: Implemented · Last updated: 2026-10-17 · Decisions: D-001, D-010, D-031_

1. `git worktree list --porcelain` is the source of truth for paths and branches.
2. Read state (no lock). Only if some entry's worktree no longer exists, prune it under the state lock. Otherwise `state.json` isn't written (D-031). Then merge state for port and color.
3. For each worktree, `git status --porcelain` → `Clean` or `N dirty`.
4. Deps mode (checks `node_modules` / `.venv`): `Source` (main repo), `Symlinked` (path is a link), `Isolated` (real directory), `None`.
5. Main's port = `basePort` (none for `passthrough`). Worktrees not created by para are tagged `(unmanaged)`.
6. Render the table (Name · Branch · Status · Port · Deps Mode), or `--json`.

Read-only apart from state pruning, so no ledger entry.

---

---

## 3. Isolate Dependencies — `para isolate <worktree> [-r <reason>]`
_Status: Command implemented (Phase 1); watcher planned (Phase 3) · Last updated: 2026-10-16 · Decisions: D-003, D-017_

`<worktree>` can be a branch name, a directory name or a path.

```mermaid
flowchart TD
    A[Manifest change detected<br/>or para isolate] --> B{Deps currently symlinked?}
    B -- No --> Z[Nothing to do]
    B -- Yes --> C[Remove symlink]
    C --> N{Strategy}
    N -- Node --> D{CoW clone possible?<br/>macOS cp -c / Linux --reflink=auto}
    D -- Yes --> E[Clone main/node_modules → worktree]
    D -- No --> F[pm install, pm from lockfile]
    N -- Python --> P[python3 -m venv .venv<br/>pip install -r requirements.txt or -e .]
    E --> G[state: isolated, drop link]
    F --> G
    P --> G
    G --> H[Append ledger entry]
```

The `.env` link is never isolated, because it is config, not dependencies.

**Trigger (Phase 3):** a file watcher on `package.json`, lockfiles, `requirements.txt` and `pyproject.toml` in symlinked worktrees notifies the developer and offers Isolate.

---

---

## 4. Remove Worktree — `para remove <worktree> [-d/--delete-branch] [-f/--force]` (`rm`)
_Status: Implemented · Last updated: 2026-10-16 · Decisions: D-001, D-007, D-019_

1. Refuse if `git status` shows uncommitted changes, unless `--force`.
2. Unlink dependency symlinks **first**: those in the state record, plus any `node_modules` / `.venv` / `.env` link pointing into the main repo. Removal can never follow them into main.
3. `git worktree remove <path>` (`--force` with `-f`), then `git worktree prune`.
4. With `--delete-branch`: `git branch -d` (`-D` with `--force`). If it fails, the CLI warns and keeps the branch.
5. Remove the state entry, which frees the port and index for reuse.
6. Append a ledger entry.

---

---

## 5. VS Code Extension
_Status: Implemented (Phase 2): sidebar tree view with Create / Open / Isolate / Remove, multi-repository workspace discovery and selection, reconfigurable port strategy dialogs, status bar, worktree switcher, context history view and ledger editor integration · Last updated: 2026-10-18 · Decisions: D-006, D-008, D-020, D-030, D-031, D-032, D-033, D-035, D-037_

**Implemented:**
- **Activation:** `onStartupFinished`, so the status bar appears without opening the view. `activate()` creates the `ParaSpace` output channel (core's `Logger`), the `WorktreeStore` (backed by `context.workspaceState`), the worktree tree view, the context history (ledger) tree view, the status bar, the commands and the change watchers, then loads the store once.
- **WorktreeStore** (D-033, D-037): the only caller of `listWorktrees` in the extension. Discovers all git repositories across workspace folders and includes all of them by default. Loads worktrees per included repository and tracks active repository (active editor or first).
- **Multi-Repo Workspace Support (D-037, D-041, D-042):**
  - **Container Folder & On-Disk Auto-Discovery:** Opening a parent directory that is not a Git repo itself automatically scans subdirectories and `.code-workspace` files via `discoverWorkspaceRepoRoots()`. In addition, `getWorkspaceRecords()` scans candidate directories on disk for `.code-workspace` files, enriches them with branch/color metadata, and registers them in `state.json` (D-042).
  - **Select Repositories to Include… (`paraSpace.selectRepositories`):** View title action allowing developers to include or uncheck/remove specific repositories in multi-root workspaces.
  - **Tree View Grouping & Workspace Nodes:** Active multi-repo workspaces appear at the top of the Worktrees view as expandable `WorkspaceNode` items with an inline **Open in New Window** button and member repository worktrees nested underneath (D-041). Below workspaces, when >1 repository is included, worktrees and context history are grouped under collapsible repository nodes; when 1 repository is open, trees remain flat.
  - **Repository-Targeted Commands:** Right-clicking a repository node in the tree allows creating a worktree or configuring port strategy directly for that repository. Invoking from the view title prompts to select the target repositories.
  - **Unified Switcher & Open Workspace Command:** `paraSpace.listWorktrees` displays active multi-repo workspaces (`$(root-folder) [Workspace] <branch>`) right below **Create Worktree…**, followed by worktrees across all included repositories (`[<repo>]`). `paraSpace.openWorkspace` (**Open Workspace…**) lists all tracked/discovered workspaces and offers **Browse for workspace file…** to pick and register any `.code-workspace` file from disk (D-041, D-042).
- **Sidebar** (activity bar container `paraSpace`):
  - **Worktrees view (`paraSpace.worktrees`):** flat rows or repository groups. Icon `repo` for main, `git-branch` for others. Description: branch · clean/dirty · port · deps mode (· unmanaged). Tooltip: path, branch, status, port, deps. Title actions: **Create Worktree…** (+), **Select Repositories…** (filter), **Configure Port Strategy…** (gear), **Refresh** (↻).
  - **Context History view (`paraSpace.ledger`):** renders entries from `.para-space/context-history.md` (newest first), grouped by repo when multiple repos exist. Each entry node shows title and timestamp, with expandable child nodes for **Requirement Context** (info), **Decisions** (check), and **Problem Solved** (pass). Title actions: **Open Context History in Editor**, **Refresh**.
- **Refresh:** the title-bar ↻ button (`paraSpace.refresh`), plus automatic, debounced (300 ms) store reloads when:
  - `~/.para-space/state.json` is created, changed or deleted (CLI or agent runs),
  - `.para-space/**` or `.para-space.json` is modified,
  - workspace folders change,
  - the window regains focus (covers plain `git worktree` commands),
  - the active editor moves to a different repo (multi-root).
  Listing doesn't write `state.json` unless it prunes, so refreshes don't trigger themselves (D-031).
- **Current worktree marker:** in the tree, the current worktree's row has a ✓ icon.
- **Status bar** (left side):
  - `$(git-branch) <branch> · :<port>`, or `$(repo) <branch>` for the main repo.
  - Preceded by a ● dot in the worktree's ParaSpace color, when it has one.
  - The tooltip shows path, branch, status, port and deps. Clicking opens the switcher.
  - Hidden when the window's folder is not in a git repo.
- **Open in New Window** (`paraSpace.openInNewWindow`): inline button and context-menu item on every row. Opens the worktree with `vscode.openFolder` and `forceNewWindow`. Hidden from the Command Palette because it needs a row.
- **`ParaSpace: List Worktrees`** (`paraSpace.listWorktrees`, the switcher; also opened from the status bar): reloads the store, then shows a quick pick.
  - The first row is **Create Worktree…**, which runs `paraSpace.createWorktree`.
  - Then every worktree, the current one marked ✓ and `current`.
  - Picking another worktree opens it in a new window; picking the current one does nothing.
- **Create Worktree…** (`paraSpace.createWorktree`, the **+** in the view title, repository context menu, and Command Palette):
  1. Target determination: a repository-node context action targets only that repo. At workspace level, when multiple repositories are discovered, a searchable multi-select picker lists all of them; currently included repositories are checked by default. The user must select at least one repository (D-038).
  2. Branch selection: for one target, a searchable QuickPick lists its existing local branches. For multiple targets, choose **Use a shared branch** or **Choose branches per repository (Advanced)**. Shared mode lists only existing branches found in every target; a new branch name can be shared across all targets. Advanced mode lets each repo use its own branch. A branch present in only some targets must be selected per repository.
  3. For each new branch, choose a base branch independently in its repo when branches are available; if none are available, creation uses that repo's current `HEAD`.
  4. Input: optional reason, recorded as the ledger's requirement.
  5. `createWorktree` runs behind a progress notification (with rollback of earlier worktrees if a later repository fails; rollback failures are surfaced). Port allocation silently defaults to `offset` on first run without prompting (D-037). IDE Peacock window coloring is applied by default to both worktrees and the `.code-workspace` file (D-040).
  6. Automatically opens the new worktree folder (single-repo) or generated `.code-workspace` multi-root workspace (multi-repo) in a new window immediately without waiting for a confirmation click (D-040).
  - Programmatic invocation: AI IDE agents and scripts can invoke `vscode.commands.executeCommand('paraSpace.createWorktree', { branch, repos, requirement, ide })` to execute non-interactively without GUI dialogs (D-040).
  - Escape on any prompt cancels quietly; nothing has been created at that point. A failure after checkout rolls back as in §1.
- **Configure Port Strategy…** (`paraSpace.configureRepo`, gear icon in Worktrees view title, repo context menu, and Command Palette):
  - Prompts for target repository (in multi-repo workspaces), then reason (recorded in context ledger), then prompts for strategy, base port, and pool range.
  - Updates `.para-space.json` via `updateConfig()`, appends an entry to `.para-space/context-history.md`, and refreshes the store and ledger views.
- **Open Context History in Editor** (`paraSpace.openLedgerFile`, in Context History title or entry context menu):
  - Opens `.para-space/context-history.md` directly in the editor.
- **Isolate Dependencies…** (`paraSpace.isolateWorktree`, right-click on a worktree whose deps are still `Symlinked`, contextValue `worktree.linked.shared`):
  - A modal confirm explains the copy or install, then an optional reason is asked.
  - `isolateWorktree` runs with progress. The result names the isolated strategies, or says there was nothing to isolate.
- **Remove Worktree…** (`paraSpace.removeWorktree`, right-click on any non-main worktree):
  - Refused if this window has that worktree open.
  - A modal confirm with **Remove** / **Remove and Delete Branch**. A dirty worktree gets only **Force Remove** variants, and the detail says how many changes will be lost and that unmerged commits go with the branch.
  - `removeWorktree` runs with progress. If a branch delete was asked for but the branch wasn't merged (non-force), a warning says the branch was kept.
- **Errors:** command errors are written to the output channel and shown as a notification. A dismissed prompt (`CancelledError`) is not an error.
- Row actions (Open, Isolate, Remove) are hidden from the Command Palette because they need a row.

---

## 6. Manifest Watching & Dependency Divergence Detection
_Status: Implemented (Phase 3): framework manifest metadata, binary divergence check in core, CLI `para check`, `para list` divergence warning, extension file watcher and 1-click breakaway isolation prompt · Last updated: 2026-10-17 · Decisions: D-003, D-017, D-036_

```mermaid
flowchart TD
    A[Manifest modified in worktree<br/>package.json, lockfile, requirements.txt] --> B{Dependencies symlinked?}
    B -- No: Isolated / Source --> C[No risk: worktree has independent dependencies]
    B -- Yes: Symlinked --> D[checkDivergence compares main vs. worktree]
    D --> E{Contents differ?}
    E -- No --> F[Safe: manifests match]
    E -- Yes --> G[Mark worktree diverged: true]
    G --> H[VS Code: warning notification<br/>'Dependencies in worktree have diverged']
    G --> I[CLI: para check fails / para list flags diverged]
    H --> J{User clicks 'Isolate Dependencies'}
    J -- Yes --> K[isolateWorktree unlinks & runs CoW clone / fresh install]
    K --> L[depsMode becomes Isolated; diverged becomes false]
    J -- No: Ignore --> M[Dismiss notification]
```

1. **Manifest Definitions:** Each `FrameworkStrategy` with `kind: 'dependencies'` declares `manifestFiles`:
   - Node: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `bun.lock`.
   - Python: `requirements.txt`, `pyproject.toml`, `Pipfile`, `Pipfile.lock`, `poetry.lock`.
2. **Divergence Engine (`checkDivergence`):** Compares binary contents of each manifest file between `mainRoot` and `worktreeRoot`. If any manifest exists in one and not the other or contents differ, the worktree is flagged `diverged: true`.
3. **Core Listing (`listWorktrees`):** Any worktree with `depsMode: 'Symlinked'` is automatically evaluated for divergence and receives `diverged: true | false`.
4. **CLI (`para check` and `para list`):**
   - `para check` scans all worktrees in the repo; outputs any diverged worktrees and files, exiting with code 1 if divergence is detected.
   - `para list` renders `Symlinked (diverged)` with a yellow highlight and prints a warning tip.
5. **VS Code Watcher (`watchManifests`):**
   - Listens to workspace file events on `**/{manifestFiles}` with 500 ms debounce.
   - Identifies the containing worktree; if symlinked and diverged, triggers a notification:
     > *"Dependencies in worktree `<branch>` have diverged from main (`<files>`). Installing packages here may alter the shared environment."*
     > **[Isolate Dependencies]** / **[Ignore]**
   - Clicking **Isolate Dependencies** triggers `isolateWorktree` (APFS copy-on-write clone or localized install), transitions the worktree to `Isolated`, and clears the divergence state.
   - Sidebar rows show a warning icon and an inline **Isolate Dependencies** action.

---

## Changelog

| Date | Change | Sections | Decision |
| :--- | :--- | :--- | :--- |
| 2026-10-16 | Initial flows derived from PROJECT_PLAN.md | All | D-001 – D-010 |
| 2026-10-16 | Phase 1 implemented: create/list/isolate/remove flows updated with flags, info/exclude, env split, rollback, Python fresh venv, unlink-first remove | 0, 1, 2, 3, 4 | D-011 – D-022 |
| 2026-10-16 | Refactor, no behaviour change: orchestrator split into `core/src/commands/*` (one file per flow), CLI split into `cli/src/commands/*`, shared helpers moved to `util/`; strategies declare `kind` | 0 | D-023 |
| 2026-10-16 | Renamed ParallelTree → ParaSpace: CLI `para`, `.para-space.json`, `.para-space/`, `~/.para-space`, `PARA_SPACE_HOME` | All | D-026 |
| 2026-10-16 | State writes serialized by `~/.para-space/state.lock`; `create` reserves index and port under the lock right after `git worktree add`, and rollback drops the reservation | 0, 1 | D-027 |
| 2026-10-17 | VS Code extension scaffolded (`packages/vscode-extension`): activation, output-channel logger, `ParaSpace: List Worktrees` quick pick that opens the chosen worktree in a new window | 0, 5 | D-030 |
| 2026-10-17 | Sidebar tree view with refresh button, auto-refresh (state.json watcher, folder changes, window focus) and Open in New Window; `list` writes state only when pruning | 2, 5 | D-031 |
| 2026-10-17 | Extension gains Create / Isolate / Remove (dialogs, progress, force-on-dirty, refuse removing the open worktree) and `vscodePrompter`; core gains `listBranches()` and shared `PORT_STRATEGY_CHOICES` | 5 | D-032 |
| 2026-10-17 | Status bar (color dot + branch · port) and worktree switcher (Create first, current marked); `WorktreeStore` shared by tree and status bar; activation on startup; reload when the active editor changes repo | 5 | D-033 |
| 2026-10-17 | New window palette (Graphite + 7 equal-lightness OKLCH colors, WCAG AA with white text); title and status bars colored, activity bar left to the theme, solid inactive title bar | 1 | D-034 |
| 2026-10-17 | Context history (ledger) view in sidebar, file open command, interactive repo port strategy config (`para config` and `paraSpace.configureRepo`), and auto-refresh on ledger/config changes | 5 | D-035 |
| 2026-10-17 | Manifest watcher, dependency divergence detection in core (`checkDivergence`), `para check` CLI command, warning indicators, and 1-click breakaway isolation flow | 2, 3, 5, 6 | D-036 |
| 2026-10-18 | Multi-repository workspace support (discover, select/remove, repo tree nodes, unified switcher) and silent default port allocation on worktree create | 1, 5 | D-037 |
| 2026-10-21 | Searchable branch QuickPick, multi-repo selection, shared or per-repo branch planning, and review before provisioning | 5 | D-038 |
| 2026-10-21 | Multi-repository workspace CLI command `para workspace create` with discovery, shared/per-repo branches, and .code-workspace generation | 1a | D-039 |
| 2026-10-21 | Peacock color injection into .code-workspace, automatic window opening, and IDE agent programmatic API | 1a, 5 | D-040 |
| 2026-10-21 | Persistent multi-repo workspace records in state.json, sidebar tree WorkspaceNode, and switcher reopening | 1a, 5 | D-041 |
| 2026-10-22 | Automatic on-disk workspace discovery, container folder scanning, and browse dialog | 1a, 5 | D-042 |
| 2026-10-22 | Zero-config AI agent architecture: VS Code Language Model Tools API, CLI stdio MCP server (`para mcp`), and `para setup-agent` | 1a, 5 | D-043 |
| 2026-10-24 | Workspace removal (`paraSpace.removeWorkspace`, `para workspace rm`), search query filtering across CLI/MCP/LM tools, stale workspace member pruning, and cross-repo worktree resolution & manifest watching | 1a, 2, 3, 4, 5, 6 | D-048 |
| 2026-10-27 | Centralized `~/.para-space/worktrees` and `~/.para-space/workspaces` storage, automatic `origin` base-branch fetch/pull on new branch creation, `para_remove_workspace` MCP/LM tool, Copilot tool metadata & `mcp.json` setup, and tree-focus-safe repository picker | 0, 1, 1a, 5 | D-049 |
| 2026-10-27 | Extracted shared multi-repo workspace orchestration (`provisionWorkspaceBatch`, `writeAndSaveWorkspace`, `removeWorkspaceCascade`) and search matchers (`findMatchingWorkspace`, `filterWorkspaces`, `filterWorktreeRows`) into `@para-space/core`; split CLI/VS Code workspace, create, MCP, and LM tool modules into `*Prompts.ts`, `*Actions.ts`, and `*Handlers.ts`; added `REUSABLE_COMPONENTS.md` registry | 0, 1a, 5 | D-050 |
| 2026-10-29 | Excluded `/.para-space/` and `/.para-space.json` via `$GIT_COMMON_DIR/info/exclude` instead of modifying `.gitignore` so ParaSpace leaves zero untracked or modified metadata files in commits | 0, 1 | D-051 |

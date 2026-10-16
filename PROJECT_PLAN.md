# ParaSpace: Parallel Workspace Orchestrator for Multi-Agent & Multi-Task IDE Workflows

A lightweight, open-source orchestration tool (CLI + VS Code Extension) that enables developers and AI coding agents to work across multiple branches concurrently using **Git Worktrees** with **zero-duplication dependency sharing**.

---

## 1. Problem Statement

Modern software engineering with AI coding agents (such as GitHub Copilot, Claude Code, Cursor, and Aider) shifts the developer's role from typing code to planning, directing, and reviewing. However, current workflows face major bottlenecks:

1. **The Single-Branch Checkout Bottleneck:**
   A standard Git repository checkout allows only one active working branch at a time. While an agent is actively coding and running tests on Branch A, a developer cannot switch to Branch B to plan the next ticket without either interrupting the agent or stashing uncommitted work.
2. **The Full Clone Penalty:**
   Creating multiple `git clone`s wastes gigabytes of disk space, duplicates the `.git` object history, and decouples local Git references so commits made in one clone aren't immediately available in another.
3. **Dependency Duplication & Setup Delays:**
   Re-running `npm install` or re-creating `.venv` virtual environments for every new branch or ticket consumes 2–10 minutes and hundreds of megabytes per checkout.
4. **Context Blindness in Multi-Window IDEs:**
   When running 3–5 IDE windows simultaneously for different tickets, all windows look identical, leading to confusion, context loss, and accidental edits on the wrong branch.

---

## 2. Solution Overview

**ParaSpace** provides an automated system that provisions isolated Git worktrees connected to a shared environment:

- **Instant Worktree Creation:** Provisions independent working directories on dedicated branches from the same local Git database.
- **Zero-Copy Dependency Sharing:** Uses absolute-path symlinks to share `node_modules` or `.venv` without copying or reinstalling.
- **Breakaway Dependency Isolation:** Detects dependency manifest modifications (`package.json`, `requirements.txt`) and safely de-symlinks the worktree to prevent polluting the main environment.
- **Ephemeral Port Offset:** Allocates distinct development server ports via `.env.local` to prevent port collisions.
- **Permission-Gated IDE Customization:** With explicit user consent, applies distinct window accent colors (the Peacock Pattern) and configures language server interpreter paths.
- **Dual Interface:** Provides both a robust Terminal CLI for scripting/agent workflows and a VS Code Extension UI for visual tracking.

---

## 3. Core Concepts & Answers to Key Design Questions

### A. The Peacock Pattern
Originating from the popular VS Code extension *Peacock* (by John Papa), this pattern customizes the IDE window frame (`titleBar.activeBackground`, `activityBar.background`, `statusBar.background`) with distinct accent colors per workspace.
- **Application in ParaSpace:** Each worktree receives a distinct color profile (e.g., Ticket 101 = Teal, Ticket 102 = Amber, Main = Blue) so developers can instantly identify which ticket/agent is running in each window.
- **User Permission:** Any modification to `.vscode/settings.json` is strictly opt-in and requires user confirmation.

### B. Dependency Isolation: What happens when a package is installed in a worktree?
- **The Risk:** If `node_modules` is symlinked to the main repo, running `npm install <pkg>` in a worktree alters the physical `node_modules` of the main repository. This could break running dev servers or tests in other branches.
- **The Solution:** 
  1. ParaSpace monitors `package.json` / lockfiles via file watchers.
  2. If a dependency change is detected, ParaSpace offers an **"Isolate (Breakaway)"** operation:
     - Removes the symlink.
     - On macOS (APFS), performs an instant copy-on-write clone (`cp -c -R`).
     - On other systems, runs a localized install so the worktree gets its own independent copy.

### C. Port Conflict Resolution via Strategy Pattern
When multiple dev servers run concurrently, port conflicts can halt parallel execution. ParaSpace handles ports using a **Pluggable Port Strategy Pattern**:
- **First-Time Repository Configuration:** When creating the first worktree in a repository, ParaSpace asks the user which port strategy they prefer and persists this choice in `.para-space.json` (or `.vscode/para-space.json`) for all future worktrees in that repo.
- **Available Port Strategies:**
  1. **Offset Strategy (`offset`):** Increments base port by worktree index (e.g., base `3000` -> `3001`, `3002`) written to `.env.local` / `.env`.
  2. **Free Port Scanner (`scan`):** Uses dynamic socket probing (`get-port`) to find and allocate the lowest available open port.
  3. **Static Pool Strategy (`pool`):** Draws from a pre-configured list or range of ports defined by the developer.
  4. **Framework Passthrough (`passthrough`):** Skips port injection and relies entirely on framework-native port shifting (e.g., Vite auto-incrementing from `5173` to `5174`).
- **Persistence:** Saved in `.para-space.json`:
  ```json
  {
    "portStrategy": "offset",
    "basePort": 3000,
    "envKeys": ["PORT", "VITE_PORT"]
  }
  ```

### D. Living Context & Decision Records (Continuous Context Tracking)
In fast-moving agentic and multi-worktree workflows, decisions and requirement shifts can easily get lost. ParaSpace embeds an automated **Living Decision & Context Tracker**:
- **Continuous Context Updates:** After every structural change, configuration shift, or major worktree event (e.g., creating a worktree, changing port strategies, de-symlinking dependencies), ParaSpace updates a structured record:
  - **Requirement Context:** What user requirement or ticket prompted this change?
  - **Decision Made:** What strategy or configuration was selected (and why)?
  - **Problem Solved:** What immediate friction or bottleneck does this resolve?
- **Storage:** Persisted locally in `.para-space/context-history.md` and repo-level `.para-space.json` so both human developers and future AI agents immediately understand the current state and history.

### E. Absolute Paths Everywhere
All symlinks and IDE settings use fully resolved absolute paths (e.g. via `path.resolve()`) to ensure binaries and language servers never fail due to relative traversal discrepancies across directories.

---

## 4. Architecture & Technical Design

```text
┌────────────────────────────────────────────────────────┐
│                   ParaSpace Core                    │
├──────────────────────────┬─────────────────────────────┤
│      CLI Interface       │      VS Code Extension      │
│  (terminal, scripts)     │  (tree view, status bar)    │
└────────────┬─────────────┴──────────────┬──────────────┘
             │                            │
             ▼                            ▼
┌────────────────────────────────────────────────────────┐
│               Worktree Orchestration Engine             │
├────────────────────────────────────────────────────────┤
│ • Git Engine (add, list, remove, prune, lock check)    │
│ • Framework Strategy Detector (Node, Python, Rust)     │
│ • Dependency Linker (absolute symlinks, APFS clone)    │
│ • Port & Env Allocator (.env / port assignment)        │
│ • State & Metadata Store (~/.para-space/state.json) │
└────────────────────────────────────────────────────────┘
```

### Framework Strategy Pattern

```typescript
export interface FrameworkStrategy {
  name: string;
  detect(projectRoot: string): Promise<boolean>;
  linkDependencies(mainRoot: string, worktreeRoot: string): Promise<void>;
  isolateDependencies(worktreeRoot: string, mainRoot: string): Promise<void>;
  configureIdeSettings?(mainRoot: string, worktreeRoot: string): Promise<Record<string, unknown>>;
}
```

1. **Node.js Strategy (`NodeStrategy.ts`):**
   - **Detection:** `package.json` exists.
   - **Link:** Symlink `path.resolve(mainRoot, 'node_modules')` -> `path.resolve(worktreeRoot, 'node_modules')`.
   - **Isolate:** Remove symlink, run `cp -c -R` or `npm install`.
2. **Python Strategy (`PythonStrategy.ts`):**
   - **Detection:** `pyproject.toml`, `requirements.txt`, or `.venv` exists.
   - **Link:** Symlink `path.resolve(mainRoot, '.venv')` -> `path.resolve(worktreeRoot, '.venv')`.
   - **IDE Config:** Set `python.defaultInterpreterPath` in the worktree's `.vscode/settings.json`.
3. **Environment Strategy (`EnvStrategy.ts`):**
   - Copies or symlinks `.env.local` / `.env` to the worktree so runtime configs and credentials work immediately out-of-the-box.

### Port Allocation Strategy Pattern

```typescript
export interface PortStrategy {
  name: 'offset' | 'scan' | 'pool' | 'passthrough';
  allocatePort(params: {
    worktreeIndex: number;
    basePort: number;
    assignedPorts: number[];
  }): Promise<number | undefined>;
}
```

- Prompt the user on repository setup: *"Which port strategy would you like to use for this project?"*
- Save decision in `.para-space.json` (committed to git or local). Future worktrees in this repo automatically read this configuration.

### Living Context & Decision Tracking System (ADR Ledger)

Every command, configuration shift, or automated agent change logs to a structured markdown file: `.para-space/context-history.md`:

```markdown
## [2026-10-16 15:50] Worktree Provisioned: feat/TK-101
- **Requirement Context:** User started Ticket TK-101 (User authentication redesign).
- **Decision Made:** 
  - Created worktree at `/Users/.../repo-TK-101`.
  - Strategy `NodeStrategy` applied: symlinked `node_modules`.
  - Port strategy `offset` used: assigned port `3001` (written to `.env.local`).
  - `.vscode/settings.json` window color set to Teal `#008080` (user approved).
- **Problem Solved:** Prevents IDE window confusion, eliminates 4-minute npm install, avoids port 3000 collision.
```

---

## 5. User Interfaces

### A. Terminal CLI (`para`)

```bash
# Create a new worktree for a ticket
para create feat/TK-101 --base main

# List all active worktrees and statuses
para list

# Break the symlink if dependencies diverged
para isolate feat/TK-101

# Remove worktree when branch is merged or finished
para remove feat/TK-101 --delete-branch
```

#### CLI List Output Example:
```text
┌──────────────────┬─────────────────┬──────────┬──────────┬─────────────┐
│ Name / Worktree  │ Branch          │ Status   │ Port     │ Deps Mode   │
├──────────────────┼─────────────────┼──────────┼──────────┼─────────────┤
│ (main)           │ main            │ Clean    │ 3000     │ Source      │
│ TK-101-auth      │ feat/TK-101     │ 3 dirty  │ 3001     │ Symlinked   │
│ TK-102-payments  │ feat/TK-102     │ Clean    │ 3002     │ Isolated    │
└──────────────────┴─────────────────┴──────────┴──────────┴─────────────┘
```

### B. VS Code Extension Dashboard

- **Activity Bar View Container:** "ParaSpace"
- **Worktree Tree View:**
  - Lists main repo and active worktrees.
  - Shows branch name, git status (dirty / clean), and assigned dev port.
  - Quick action buttons: **Open in New Window**, **Isolate Dependencies**, **Delete Worktree**.
- **Status Bar Item:** Shows active worktree name and color indicator with a quick switcher dropdown.

---

## 6. Scope & Phased Implementation Roadmap

### Phase 1: MVP (Core CLI & Linking Engine)
- [x] Initialize monorepo structure (`packages/core` and `packages/cli`).
- [x] Git worktree lifecycle management (`git worktree add`, `remove`, `list`, `prune`).
- [x] Node.js absolute-path symlinking (`node_modules`).
- [x] Python `.venv` linking and interpreter config.
- [x] Environment file propagation (`.env.local`).
- [x] **Port Allocation Strategy Pattern:**
  - [x] Implement `offset`, `scan`, `pool`, and `passthrough` strategies.
  - [x] Interactive prompt to select strategy on first repository run.
  - [x] Persist chosen port strategy in `.para-space.json` for future worktrees.
- [x] **Living Context & Decision Tracker:**
  - [x] Implement logger that records requirement context, decisions made, and problems solved to `.para-space/context-history.md` after every change.
- [x] Permission check before touching `.vscode/settings.json`.

### Phase 2: VS Code Extension
- [ ] Initialize `packages/vscode-extension`.
- [ ] Sidebar TreeView displaying active worktrees, branches, and statuses.
- [ ] Status bar indicator and quick switcher.
- [ ] Peacock-style window coloring (with permission prompt).
- [ ] Interactive UI for selecting port strategies and viewing the decision history.
- [ ] One-click "Launch in New Window".

### Phase 3: Safety, Watchers & Isolation
- [ ] Manifest watcher: alert developer when `package.json` changes in a symlinked worktree.
- [ ] One-click / automated `para isolate` command.
- [ ] macOS APFS Copy-on-Write (CoW) fast cloning support.

### Phase 4: Monorepo & Ecosystem Expansion
- [ ] Monorepo support (pnpm workspaces, Turborepo, Nx).
- [ ] Additional framework strategies (Rust `Cargo.toml`, Go, PHP/Composer).
- [ ] Integration with GitHub CLI (`gh pr checkout` to worktree).

---

## 7. Edge Cases & Mitigations

| Edge Case | Potential Impact | Mitigation |
| :--- | :--- | :--- |
| **Dependency Divergence** | Installing a package alters the shared `node_modules`. | Lockfile watcher + `isolate` command (convert symlink to real directory). |
| **Port Clashes** | Two dev servers fail to start on the same port. | Dynamic port allocation written to `.env.local` + free-port probe. |
| **Git Lock Files** | Multiple Git processes colliding. | Git worktrees isolate `index` and `HEAD` per worktree, preventing collision. |
| **Settings Overwrites** | Tool alters developer's personal settings without consent. | Explicit opt-in prompt before creating or modifying `.vscode/settings.json`. |
| **Windows Symlinks** | Windows requires elevated permissions for folder symlinks. | Fall back to Directory Junctions (`mklink /J`) on Windows. |

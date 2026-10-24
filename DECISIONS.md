# ParaSpace — Decision Log

Every architectural or behavioral decision for ParaSpace, newest last. Each entry records the requirement that prompted it, what was decided, and what problem it solves (the same shape the product's own `.para-space/context-history.md` ledger uses).

**How to update:** append a new `D-NNN` entry after any change that alters design, scope, config format, or behavior. Never rewrite an accepted entry. If a decision is reversed, add a new entry and mark the old one `Superseded by D-NNN`. Move items out of **Open Questions** once they are decided.

Status values: `Accepted` · `Proposed` · `Superseded by D-NNN` · `Rejected`

---

## Index

| ID | Decision | Status | Date |
| :--- | :--- | :--- | :--- |
| D-001 | Use Git worktrees, not multiple clones | Accepted | 2026-10-16 |
| D-002 | Share dependencies via absolute-path symlinks | Accepted | 2026-10-16 |
| D-003 | Breakaway isolation when manifests change | Accepted | 2026-10-16 |
| D-004 | Pluggable port strategy, chosen once per repo | Accepted | 2026-10-16 |
| D-005 | Framework Strategy Pattern for ecosystem support | Accepted | 2026-10-16 |
| D-006 | IDE customization is strictly opt-in | Accepted | 2026-10-16 |
| D-007 | Living context ledger after every change | Accepted | 2026-10-16 |
| D-008 | Monorepo with shared core, CLI and VS Code extension | Accepted | 2026-10-16 |
| D-009 | Windows falls back to directory junctions | Accepted | 2026-10-16 |
| D-010 | Global state store at `~/.para-space/state.json` | Accepted | 2026-10-16 |
| D-011 | pnpm workspaces + tsup + vitest for ParaSpace's own repo | Accepted | 2026-10-16 |
| D-012 | Worktrees live in sibling dirs named `<repo>-<branch-slug>` | Accepted | 2026-10-16 |
| D-013 | `.env` is symlinked; `.env.local` is a per-worktree copy | Accepted | 2026-10-16 |
| D-014 | Commit `.para-space.json`; gitignore the ledger | Accepted | 2026-10-16 |
| D-015 | Repo config lives at the repo root | Accepted | 2026-10-16 |
| D-016 | Link pnpm `node_modules` whole; skip Yarn PnP | Accepted | 2026-10-16 |
| D-017 | Isolate = CoW clone, else fresh install; Python always rebuilds venv | Accepted | 2026-10-16 |
| D-018 | Default env keys `PORT` (+ `VITE_PORT` for Vite projects) | Accepted | 2026-10-16 |
| D-019 | Hide links via `$GIT_COMMON_DIR/info/exclude` | Accepted | 2026-10-16 |
| D-020 | Core never prompts; non-interactive mode for agents | Accepted | 2026-10-16 |
| D-021 | Python interpreter path points at the worktree's own `.venv` | Accepted | 2026-10-16 |
| D-022 | `create` rolls back on failure; state writes are atomic | Accepted | 2026-10-16 |
| D-023 | One module per command; strategies declare `kind` | Accepted | 2026-10-16 |
| D-024 | Prettier formats all code (not Markdown docs) | Accepted | 2026-10-16 |
| D-025 | Pre-commit hook runs Prettier on staged files | Accepted | 2026-10-16 |
| D-026 | Project renamed to para-space; CLI renamed to `para` | Accepted | 2026-10-16 |
| D-027 | Lock file serializes state writes; `create` reserves its slot under the lock | Accepted | 2026-10-16 |
| D-028 | TSDoc on the public API; one-line "why" comments elsewhere | Accepted | 2026-10-16 |
| D-029 | GUIDELINES.md is the single home for contributor rules | Accepted | 2026-10-16 |
| D-030 | Extension ships as one CommonJS bundle with core inlined | Accepted | 2026-10-17 |
| D-031 | Tree view refreshes on state.json changes and focus; `list` writes only when pruning | Accepted | 2026-10-17 |
| D-032 | Extension actions use modal confirms, a VS Code prompter and core-owned shared choices | Accepted | 2026-10-17 |
| D-033 | Shared `WorktreeStore`; status bar with color dot; startup activation | Accepted | 2026-10-17 |
| D-034 | Equal-lightness OKLCH window palette; color only title and status bars | Accepted | 2026-10-17 |
| D-035 | Context history tree view and interactive port strategy configuration | Accepted | 2026-10-17 |
| D-036 | Manifest watching, dependency divergence detection, and one-click breakaway isolation | Accepted | 2026-10-17 |
| D-037 | Multi-repository workspace support and silent default port allocation on worktree create | Accepted | 2026-10-18 |
| D-038 | Searchable branch selection and multi-repo workspace provisioning on create | Accepted | 2026-10-21 |
| D-039 | Multi-repository workspace CLI command `para workspace create` | Accepted | 2026-10-21 |
| D-040 | Workspace Peacock color injection, automatic window launch, and IDE agent programmatic API | Accepted | 2026-10-21 |
| D-041 | Persistent multi-repo workspace records, tree view workspace nodes, and switcher reopening | Accepted | 2026-10-21 |
| D-042 | Automatic on-disk workspace discovery, container folder scanning, and browse dialog | Accepted | 2026-10-22 |
| D-043 | Zero-config AI agent architecture: VS Code Language Model Tools and CLI MCP Server | Accepted | 2026-10-22 |
| D-044 | Adopt MIT License for open-source distribution | Accepted | 2026-10-23 |
| D-045 | Self-contained CLI bundle and public registry metadata | Accepted | 2026-10-23 |
| D-046 | Automated GitHub Actions CI and tag-driven release pipeline | Accepted | 2026-10-23 |
| D-047 | Review new APIs and block deprecated TypeScript APIs in CI | Accepted | 2026-10-24 |

---

## D-001 — Use Git worktrees, not multiple clones
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** Developers and AI agents need several branches checked out and active at once.
- **Decision Made:** Provision each parallel workspace with `git worktree add` against the main repo's `.git` database.
- **Alternatives Considered:** Multiple `git clone`s (duplicates object history, refs not shared); `git stash` + branch switching (interrupts running agents).
- **Problem Solved:** Removes the single-checkout bottleneck without the disk cost and ref divergence of full clones. Each worktree gets its own `index` and `HEAD`, so concurrent Git processes don't collide on lock files.

## D-002 — Share dependencies via absolute-path symlinks
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** Re-running `npm install` / creating `.venv` per worktree costs 2–10 minutes and hundreds of MB.
- **Decision Made:** Symlink `node_modules` / `.venv` from the main repo into each worktree. All links and IDE paths use `path.resolve()` absolute paths.
- **Problem Solved:** Zero-copy, instant dependency availability. Absolute paths stop binaries and language servers from breaking on relative-traversal differences.
- **Trade-off:** A shared directory can be mutated from any worktree — mitigated by D-003.

## D-003 — Breakaway isolation when manifests change
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** `npm install <pkg>` inside a symlinked worktree would modify the main repo's `node_modules` and could break other branches' servers/tests.
- **Decision Made:** Watch `package.json` / lockfiles (and Python manifests). On change, offer **Isolate (Breakaway)**: remove the symlink, then copy-on-write clone (`cp -c -R`) on macOS APFS, or run a local install elsewhere. Also exposed as `para isolate <branch>`.
- **Problem Solved:** Keeps the shared environment clean while letting a worktree diverge when it genuinely needs to.

## D-004 — Pluggable port strategy, chosen once per repo
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** Concurrent dev servers collide on the same port.
- **Decision Made:** `PortStrategy` interface with four implementations — `offset`, `scan` (via `get-port`), `pool`, `passthrough`. On the first worktree in a repo, prompt the user to pick one; persist it in `.para-space.json` (`portStrategy`, `basePort`, `envKeys`). Allocated ports are written to `.env.local`.
- **Problem Solved:** No port clashes, and no repeated prompting — later worktrees reuse the saved choice.

## D-005 — Framework Strategy Pattern for ecosystem support
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** Different stacks keep dependencies in different places and need different IDE config.
- **Decision Made:** `FrameworkStrategy` interface (`detect`, `linkDependencies`, `isolateDependencies`, optional `configureIdeSettings`). Initial strategies: `NodeStrategy`, `PythonStrategy`, `EnvStrategy`. Rust/Go/PHP come in Phase 4.
- **Problem Solved:** New ecosystems are added without touching the orchestration engine.

## D-006 — IDE customization is strictly opt-in
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** Multiple identical IDE windows cause context loss; but silently editing settings is unacceptable.
- **Decision Made:** Peacock-pattern window colors (`titleBar`, `activityBar`, `statusBar`) and interpreter paths are written to the worktree's `.vscode/settings.json` only after explicit user confirmation.
- **Problem Solved:** Windows are visually distinguishable without overwriting a developer's personal settings.

## D-007 — Living context ledger after every change
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** In agent-driven, multi-worktree work, the reasons behind changes get lost.
- **Decision Made:** After every structural change, config shift, or worktree event, append an entry (Requirement Context / Decision Made / Problem Solved) to `.para-space/context-history.md`.
- **Problem Solved:** Humans and future agents can reconstruct current state and history without asking.

## D-008 — Monorepo with shared core, CLI and VS Code extension
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** Need a scriptable interface for agents and a visual one for humans.
- **Decision Made:** `packages/core` (orchestration engine), `packages/cli` (`para`), `packages/vscode-extension`. Both interfaces call the same core. TypeScript, per the interface definitions in the plan.
- **Problem Solved:** One implementation of the logic, two front-ends, no behavior drift.

## D-009 — Windows falls back to directory junctions
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** Folder symlinks on Windows need elevated permissions.
- **Decision Made:** Use directory junctions (`mklink /J`, or Node `fs.symlink(..., 'junction')`) on Windows.
- **Problem Solved:** Dependency sharing works for non-admin Windows users.

## D-010 — Global state store at `~/.para-space/state.json`
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** CLI and extension need a shared view of worktrees, assigned ports, deps mode and colors.
- **Decision Made:** Machine-level state in `~/.para-space/state.json`; repo-level config in `.para-space.json`; per-repo history in `.para-space/context-history.md`.
- **Problem Solved:** Port allocation can see ports already assigned across worktrees; both interfaces read the same state.


## D-011 — pnpm workspaces + tsup + vitest for ParaSpace's own repo
- **Status:** Accepted · 2026-10-16 · resolves Open Question 5
- **Requirement Context:** D-008 needs a monorepo layout for `core`, `cli` and later the extension.
- **Decision Made:** pnpm workspaces (`packages/*`), tsup for ESM builds (+ `.d.ts` for core), vitest for tests. No Turborepo.
- **Problem Solved:** Strict workspace linking and fast builds without pipeline tooling that three packages don't need.

## D-012 — Worktrees live in sibling dirs named `<repo>-<branch-slug>`
- **Status:** Accepted · 2026-10-16 · resolves Open Question 4
- **Requirement Context:** Need a predictable location and name for each worktree.
- **Decision Made:** `para create feat/TK-101` in `/code/myapp` creates `/code/myapp-feat-TK-101`. Slug: `/` and unsafe characters → `-`.
- **Alternatives Considered:** Nested `<repo>/.worktrees/` (pulls worktrees into the main repo's watchers, linters and test runners).
- **Problem Solved:** Worktrees never show up inside the main repo's file tree, and names are guessable from the branch.

## D-013 — `.env` is symlinked; `.env.local` is a per-worktree copy
- **Status:** Accepted · 2026-10-16 · resolves Open Question 3
- **Requirement Context:** `EnvStrategy` said "copies or symlinks", but per-worktree ports must not leak into the main repo.
- **Decision Made:** Symlink `.env` (shared secrets/config). Copy `.env.local` from main if present, then upsert the port keys into the copy.
- **Problem Solved:** Secret edits propagate everywhere, while each worktree owns its port. Projects that keep secrets only in `.env.local` get a snapshot copy, not live sharing.

## D-014 — Commit `.para-space.json`; gitignore the ledger
- **Status:** Accepted · 2026-10-16 · resolves Open Question 2
- **Requirement Context:** Should config and history be team-shared?
- **Decision Made:** `.para-space.json` is meant to be committed. On first run, `.para-space/` is appended to the repo `.gitignore`.
- **Problem Solved:** The team shares one port strategy. The ledger holds machine-specific absolute paths, so it stays local and causes no merge noise.

## D-015 — Repo config lives at the repo root
- **Status:** Accepted · 2026-10-16 · resolves Open Question 1
- **Decision Made:** `.para-space.json` at the main repo root, not `.vscode/para-space.json`.
- **Problem Solved:** The config is editor-neutral. The CLI and agents don't depend on VS Code conventions.

## D-016 — Link pnpm `node_modules` whole; skip Yarn PnP
- **Status:** Accepted · 2026-10-16 · resolves Open Question 6
- **Decision Made:** pnpm's `node_modules` is linked as one directory: its internal links are relative, so they still resolve. Yarn PnP (`.pnp.cjs`) has no `node_modules`, so Node linking is skipped with a warning.
- **Problem Solved:** Supports both without special-casing the store layout.

## D-017 — Isolate = CoW clone, else fresh install; Python always rebuilds venv
- **Status:** Accepted · 2026-10-16 · resolves Open Question 7
- **Decision Made:** Node: remove the link, then `cp -c -R` (macOS) or `cp -R --reflink=auto` (Linux). If no clone is possible (Windows, or the clone fails), run `<pm> install` with the package manager detected from the lockfile (pnpm/yarn/bun/npm). Python: always `python3 -m venv .venv`, then `pip install -r requirements.txt` (or `-e .`).
- **Problem Solved:** Isolation is instant where the filesystem allows it. Venvs hard-code their own absolute path in their scripts, so a cloned venv would still point at main.

## D-018 — Default env keys `PORT` (+ `VITE_PORT` for Vite projects)
- **Status:** Accepted · 2026-10-16 · resolves Open Question 8
- **Decision Made:** On first run, `envKeys` = `["PORT"]`, plus any keys from `FrameworkStrategy.defaultEnvKeys()` (Node adds `VITE_PORT` when `vite` is a dependency). Python projects get `PORT`. Editable afterwards in `.para-space.json`.
- **Problem Solved:** Sensible defaults for every stack without asking.

## D-019 — Hide links via `$GIT_COMMON_DIR/info/exclude`
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** A gitignore pattern like `node_modules/` only matches directories, so a `node_modules` *symlink* shows as untracked. That makes worktrees look dirty and blocks `git worktree remove`.
- **Decision Made:** Append root-anchored, slash-less patterns (`/node_modules`, `/.venv`, `/.env`, `/.env.local`) under a `# para-space` header in the shared `info/exclude`.
- **Problem Solved:** Worktrees report clean. The file is never committed and applies to all worktrees at once. It also applies to the main repo, but already-tracked files are unaffected.

## D-020 — Core never prompts; non-interactive mode for agents
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** The same core must serve a TTY CLI, the VS Code extension and headless AI agents.
- **Decision Made:** Core takes an injected `Prompter` (`selectPortStrategy`, `confirmIdeSettings`, `confirm`). The CLI passes a clack implementation only when stdin/stdout are TTYs and `--yes` is not set. Without a prompter: the port strategy comes from `--port-strategy` (default `offset`), and IDE settings are written only with `--ide`.
- **Problem Solved:** Agents can script `para` without hanging on prompts. D-006 consent still holds, because a non-interactive run never writes settings unless asked explicitly.

## D-021 — Python interpreter path points at the worktree's own `.venv`
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** PROJECT_PLAN §4 implied pointing `python.defaultInterpreterPath` at main's venv.
- **Decision Made:** Use the absolute path `<worktree>/.venv/bin/python` (`Scripts\python.exe` on Windows).
- **Problem Solved:** It is still absolute (§3E), resolves through the link while shared, and stays correct after `isolate` without rewriting settings.

## D-022 — `create` rolls back on failure; state writes are atomic
- **Status:** Accepted · 2026-10-16
- **Decision Made:** If any step after `git worktree add` fails, unlink created links, `git worktree remove --force`, and delete the branch only if `create` made it. `state.json` is written to a temp file and renamed. `PARA_SPACE_HOME` overrides `~/.para-space` (used by tests).
- **Problem Solved:** A failed create leaves no half-provisioned worktree or orphan branch, and a crash mid-write cannot corrupt state.


## D-023 — One module per command; strategies declare `kind`
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** The user asked for clean, DRY, orthogonal code with long files split logically. `orchestrator.ts` had grown to ~370 lines holding all four flows, and `list` had to hard-code "skip `.env`" to tell dependency links from config links.
- **Decision Made:** Each flow lives in its own file under `core/src/commands/` (`config`, `create`, `list`, `isolate`, `remove`, plus `resolve` for finding a worktree). Each CLI command lives in its own file under `cli/src/commands/`, with shared CLI plumbing in `runtime.ts`. Repeated code moved into helpers: `util/fs` (`exists`, `readTextIfExists`), `util/format` (`code`, `codeList`), `link.linkFromMain`, `frameworks/shared`, `ports.allocateWorktreePort` / `mainRepoPort`, `state.nextWorktreeIndex`. `FrameworkStrategy` gains `kind: 'dependencies' | 'config'`, and `sharedPaths(kind)` replaces the hard-coded check. The unused `Prompter.confirm` / `warn` members were removed.
- **Problem Solved:** Each module has one job, new commands or strategies don't touch the others, and the same logic isn't maintained in several places. Behaviour is unchanged (same tests pass).


## D-024 — Prettier formats all code (not Markdown docs)
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** The user wants consistent automatic formatting.
- **Decision Made:** Prettier 3 at the workspace root, configured in `.prettierrc.json`: single quotes, trailing commas, `printWidth` 120, matching the existing style. `pnpm format` rewrites files and `pnpm format:check` verifies them (for CI). `.prettierignore` skips `dist/`, the lockfile and `*.md`, so the hand-written decision and flow docs are never reflowed.
- **Problem Solved:** Formatting is no longer a matter of taste or review comments, and diffs stay focused on behaviour.


## D-025 — Pre-commit hook runs Prettier on staged files
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** The user wants the formatter to run before every commit.
- **Decision Made:** `simple-git-hooks` installs a `pre-commit` hook (via the root `prepare` script, which runs on `pnpm install`) that runs `lint-staged`. `lint-staged` runs `prettier --write --ignore-unknown` on staged files only and re-stages the result. The package's own install script stays disabled in `pnpm-workspace.yaml` (`allowBuilds: simple-git-hooks: false`) because `prepare` already installs the hook. Chosen over husky because it needs no extra hook directory.
- **Problem Solved:** Unformatted code can't be committed by accident, and commits stay fast because only staged files are touched.


## D-026 — Project renamed to para-space; CLI renamed to `para`
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** The user renamed the project from ParallelTree (folder `parallel-worktree`) to para-space.
- **Decision Made:** The name changes everywhere: prose and types `ParaSpace` / `ParaSpaceConfig`; packages `@para-space/core` and `@para-space/cli` (root `para-space`); repo config `.para-space.json`; ledger dir `.para-space/`; machine state `~/.para-space/state.json`; env override `PARA_SPACE_HOME`; the `info/exclude` marker `# para-space`; CLI command `para`; folder `para-space`. Earlier entries were updated to the new names, since nothing had been released under the old ones.
- **Problem Solved:** One consistent name across code, docs and on-disk files.


## D-027 — Lock file serializes state writes; `create` reserves its slot under the lock
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** Phase 2 adds the VS Code extension alongside the CLI and agents, so several `para` operations can now run at the same time (Open Question #1). Atomic writes (D-022) prevented corrupt files but not lost updates: two processes could read the same state and the last write would win. `create` also read state at the start and wrote it only at the end, so two creates could pick the same index and port.
- **Decision Made:** `updateRepoState` holds an exclusive lock file, `~/.para-space/state.lock`, for the whole read-modify-write. The lock is created with `open(..., 'wx')`, which is atomic across processes, and stores `{pid, host, acquiredAt}`. Waiters retry with jitter and give up after 10 s with a message naming the file. A lock is treated as abandoned if its process on this host is dead or it is older than 30 s. One global lock, because `state.json` is one file shared by all repos. Reads (`getRepoState`) stay lock-free because writes are atomic. `create` now reserves a slot right after `git worktree add`: under the lock it picks the next index, allocates the port and writes a placeholder record. It fills in links and color at the end, and rollback removes the reservation. Reserving after `git worktree add` means a concurrent `list` never prunes the placeholder. The lock is not re-entrant, and `updateRepoState` callbacks may now be async.
- **Problem Solved:** Concurrent creates get distinct indices and ports, and concurrent create/isolate/remove/list runs no longer overwrite each other's state.
- **Known limit:** If two waiters reclaim the same stale lock at the same moment, one could delete the other's fresh lock. This needs a crashed holder plus a race within milliseconds, so it was accepted to keep the lock simple.


## D-028 — TSDoc on the public API; one-line "why" comments elsewhere
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** The user wanted every function commented with its responsibility, definition and example. The VS Code extension (Phase 2) is about to consume `@para-space/core`, so its API needs to explain itself where it's used.
- **Decision Made:** Documentation scales with how public a symbol is. (1) Everything exported from `@para-space/core`'s `index.ts`, plus `withFileLock` and `updateRepoState`, gets TSDoc: a one-line summary, then responsibility and constraints, then `@param` / `@returns` / `@throws` where they add something beyond the types, and an `@example`. (2) Internal helpers get at most one line explaining *why*, not *what*. (3) Self-explanatory functions get no comment. Comments point to `D-NNN` and FLOW.md sections instead of repeating them. Tests remain the executable examples.
- **Problem Solved:** VS Code shows docs and examples on hover wherever the API is used, without comments that just restate the code and go stale. This is a convention only: it isn't enforced by lint yet (`eslint-plugin-jsdoc` is an option), and TypeDoc could later generate an API reference from the same comments.


## D-029 — GUIDELINES.md is the single home for contributor rules
- **Status:** Accepted · 2026-10-16
- **Requirement Context:** Working rules were spread across the README, decision entries and individual instructions. The user asked for one guidelines file, updated every time a new protocol is agreed.
- **Decision Made:** `GUIDELINES.md` at the repo root holds every contributor rule as numbered items in sections (living docs, code structure, comments, state and concurrency, safety, testing, formatting and commits), each linking to the decision behind it. A new rule is added there in the same change that introduces it, with a changelog row. The README's "Keeping the docs current" section moved there; the README now only links to it. The file is tool-neutral, so no `CLAUDE.md` or other agent-specific files are added.
- **Problem Solved:** Humans and AI agents have one place to read before working, and rules don't drift between several copies.


## D-030 — Extension ships as one CommonJS bundle with core inlined
- **Status:** Accepted · 2026-10-17
- **Requirement Context:** Phase 2 starts the VS Code extension, a third front end over core (D-008). VS Code loads extensions with `require()`, while core is ESM and depends on the ESM-only `get-port`. Published extensions should not depend on a `node_modules` folder.
- **Decision Made:** New package `packages/vscode-extension` (package name `para-space-vscode`, display name ParaSpace, `private`). `tsup` bundles `src/extension.ts` into a single CommonJS `dist/extension.js` with source maps. `@para-space/core` is a devDependency and is inlined (`noExternal`); only `vscode` stays external. Engine `^1.90.0` with matching `@types/vscode`. There are no explicit `activationEvents`: since VS Code 1.74, contributed commands activate the extension on first use. Logic that doesn't need the VS Code API lives in vscode-free modules (e.g. `items.ts`) so vitest can test it. The root `.vscode/launch.json` and `tasks.json` make F5 build core and the extension and open an Extension Development Host. The first command is `ParaSpace: List Worktrees`. `publisher` is a placeholder (`para-space`) until a Marketplace publisher exists.
- **Problem Solved:** The extension reuses core unchanged, installs without dependencies, starts fast, and is developed with the same toolchain as the other packages (D-011).


## D-031 — Tree view refreshes on state.json changes and focus; `list` writes only when pruning
- **Status:** Accepted · 2026-10-17
- **Requirement Context:** The sidebar must stay correct when worktrees are created or removed outside the extension: by the `para` CLI, by agents, or by plain `git worktree` commands. But `listWorktrees` rewrote `state.json` on every call, so a view that refreshes when `state.json` changes would trigger itself in an endless loop. Every list also took the state lock for no reason.
- **Decision Made:** (1) `listWorktrees` reads state without the lock and calls `updateRepoState` only when some record's worktree is gone. Otherwise `state.json` isn't touched. (2) The extension refreshes the view, debounced by 300 ms, on: a `FileSystemWatcher` on `~/.para-space/state.json` (create, change, delete), workspace-folder changes, and the window regaining focus. Focus covers plain git commands, which never touch `state.json`. A manual ↻ button covers anything else. Polling and watching `.git/worktrees` were rejected: polling wastes work, and the git internals differ between the main repo and worktrees. (3) The tree is a flat list (main first). Rows carry `contextValue` `worktree.main` / `worktree.linked` so later actions can target one or the other. Open in New Window, an inline button on every row, came forward from roadmap step 4 because it was one line.
- **Problem Solved:** The view stays in sync with CLI, agent and git activity without polling or refresh loops. Listing becomes fully read-only in the common case.


## D-032 — Extension actions use modal confirms, a VS Code prompter and core-owned shared choices
- **Status:** Accepted · 2026-10-17
- **Requirement Context:** Phase 2 step 3 brings Create, Isolate and Remove to the sidebar. They must be as safe as the CLI, must need no terminal, and must not duplicate logic between front ends.
- **Decision Made:**
  - **Prompter:** `vscodePrompter` implements core's `Prompter` with quick picks, input boxes and a modal confirm. Core is unchanged (D-020).
  - **Cancel vs. "no":** Escape on a prompt throws `CancelledError`, which `action()` swallows. Before `git worktree add` this means nothing was created. Dismissing the IDE-settings dialog returns "no" instead of cancelling, because the worktree already exists by then and cancelling would only trigger a rollback.
  - **Destructive actions** use modal confirmations. Remove offers **Force** variants only when the row shows uncommitted changes, so a clean worktree can never be force-removed by accident. It refuses to remove the worktree open in the current window.
  - **Long operations** (create, isolate, remove) run behind a progress notification.
  - **Shared with core:** `listBranches()` (for the base picker) and `PORT_STRATEGY_CHOICES` (labels and hints for both front ends) live in core, so the extension never runs git itself and the CLI and extension stay consistent. Field validation lives in the extension's vscode-free `dialogs.ts`; pool validation reuses core's `parsePortPool`.
  - **Code layout:** one module per command under `src/commands/`, mirroring the CLI.
  - **Testing:** vitest resolves `@para-space/core` to its source, so front-end tests never depend on a stale core build.
- **Problem Solved:** The sidebar covers the whole worktree lifecycle without a terminal, with the same safety rules as the CLI and one source for shared text and git queries.


## D-033 — Shared `WorktreeStore`; status bar with color dot; startup activation
- **Status:** Accepted · 2026-10-17
- **Requirement Context:** Phase 2 step 4 adds a status bar item for the current worktree and a quick switcher. The tree and the status bar need the same data. Calling `listWorktrees` from each, which runs `git status` per worktree, would double the work on every refresh, and the two could disagree.
- **Decision Made:**
  - **One store.** A single `WorktreeStore` owns loading. The tree and status bar subscribe to `onDidChange`; commands and watchers call `store.load()`. Overlapping load requests collapse into one extra run, so the last change is never missed and loads never pile up.
  - **Current worktree** = the row whose path contains the window's folder, with the deepest match winning. It's marked ✓ in the tree and the switcher.
  - **Status bar** = two items: a ● dot colored with the worktree's ParaSpace color, and `branch · :port`. VS Code only lets a status bar item's *background* use error or warning theme colors, so a tinted foreground dot is the only way to show an arbitrary hex color. The dot is hidden when there's no recorded color (the main repo and unmanaged worktrees).
  - **Switcher.** `paraSpace.listWorktrees` becomes the switcher (same id, so nothing breaks), with **Create Worktree…** as its first row.
  - **Activation.** `onStartupFinished`, so the status bar shows without opening the view, without slowing VS Code's startup.
  - **Multi-root.** Switching the active editor reloads only when it moves to a different repo.
- **Problem Solved:** Every window shows which worktree it is and its port at a glance, and switching takes two clicks. All views stay consistent at the cost of one `listWorktrees` per refresh.


## D-034 — Equal-lightness OKLCH window palette; color only title and status bars
- **Status:** Accepted · 2026-10-17
- **Requirement Context:** The user found the window colors ugly. The old palette (Teal, Amber, Purple, Crimson, Green, Slate, Magenta) was hand-picked, so some colors looked much louder than others. Slate was barely a color. The colors were applied as flat fills over the title bar, activity bar and status bar. The inactive title bar was the color at 60% opacity, which blends with what is behind it and turns muddy.
- **Decision Made:**
  - **Palette.** Built in OKLCH: main = Graphite (neutral, `#414853`); worktrees = Lagoon, Coral, Violet, Ochre, Cobalt, Jade, Orchid.
    - Every worktree color has lightness L≈0.54, so none dominates. Chroma is tuned per hue to stay inside the sRGB gamut.
    - Hues are about 45° apart and ordered to alternate warm/cool, so consecutive worktrees (the ones open side by side) differ most.
    - Checked: white text ≥ 4.78:1 (WCAG AA) on every color and its deeper shade, the dot on a dark status bar ≥ 3.29:1, and the closest pair ΔE_ok ≥ 0.09.
  - **Shades.** Each `ColorProfile` now carries `dark` (L−0.07) and `light` (L+0.06) shades of the same hue. They are precomputed, so core needs no color math at runtime.
  - **Application** (`peacockSettings(profile)`):
    - Title bar and status bar get the color with white text. The inactive title bar, `titleBar.border` and `statusBar.border` get the solid deeper shade. Status bar hover gets the lighter shade.
    - The activity bar stays in the user's theme, with only a colored active marker and badge.
    - No translucent fills.
  - `peacockSettings` now takes a `ColorProfile` instead of a hex string.
  - Existing worktrees keep the settings they were created with; the new colors apply to worktrees created from now on.
- **Problem Solved:** Windows are identifiable at a glance by two calm bands of color that look like one designed family, with readable text everywhere and no muddy blends.


## D-035 — Context history tree view and interactive port strategy configuration
- **Status:** Accepted · 2026-10-17
- **Requirement Context:** Phase 2 required visual inspection of the decision ledger (`.para-space/context-history.md`) in the VS Code sidebar, and an interactive way to inspect and reconfigure repository port strategies without manually editing `.para-space.json`.
- **Decision Made:**
  - **Core:** Added `parseLedger()` and `readLedger()` to parse context ledger markdown into structured `LedgerEntry` objects (timestamp, requirement, decisions, problem solved). Added `updateConfig()` to validate and save `.para-space.json` while appending an update record to the ledger.
  - **CLI:** Added `para config` to view active repository configuration, or update port strategy, base port, and pool options interactively or via flags.
  - **Extension:**
    - Secondary view `paraSpace.ledger` ("Context History") under the `paraSpace` container, rendering entries newest-first. Each entry expands into its Requirement, Decisions list, and Problem Solved with theme icons (`info`, `check`, `pass`).
    - Title actions: `Open Context History in Editor` (`paraSpace.openLedgerFile`) and `Configure Port Strategy…` (`paraSpace.configureRepo`).
    - File watchers: watching `**/.para-space/**` and `**/.para-space.json` debounced so changes made by the CLI or agents update the views immediately.
- **Problem Solved:** Completed all Phase 2 features. Developers and agents can inspect project context and change port strategies directly in both the IDE and the CLI.


## D-036 — Manifest watching, dependency divergence detection, and one-click breakaway isolation
- **Status:** Accepted · 2026-10-17
- **Requirement Context:** Phase 3 required detecting when package manifests or lockfiles are modified in a symlinked worktree, warning developers before packages are installed in the shared root, and providing a one-click breakaway isolation flow (D-003).
- **Decision Made:**
  - **Framework manifest metadata:** `FrameworkStrategy` declares `manifestFiles?: string[]` (Node: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, bun locks; Python: `requirements.txt`, `pyproject.toml`, Pipfiles, poetry locks).
  - **Core divergence engine:** Added `checkDivergence(mainRoot, worktreeRoot)` to compare binary contents of manifest files. If any manifest differs while dependencies are symlinked, `WorktreeInfo` is marked `diverged: true`.
  - **CLI:** Added `para check` command to inspect all worktrees for manifest divergence with non-zero exit code on divergence (ideal for CI/scripts/agents). `para list` displays `Symlinked (diverged)` with a yellow warning.
  - **VS Code extension:**
    - `watchManifests()` watcher debounces file events on manifest patterns across the workspace.
    - On divergence, displays a modal-free warning notification with **Isolate Dependencies** and **Ignore**, throttling duplicate alerts per divergence state.
    - Diverged worktree tree items receive a warning icon, `worktree.linked.shared.diverged` context, and an inline **Isolate Dependencies** action right on the sidebar row.
- **Problem Solved:** Fully delivers Phase 3 safety guarantees, eliminating the risk of accidental mutations to the shared dependency root.


## D-037 — Multi-repository workspace support and silent default port allocation on worktree create
- **Status:** Accepted · 2026-10-18
- **Requirement Context:**
  1. In multi-root workspaces with multiple repositories open simultaneously, ParaSpace previously defaulted to only the active editor or first folder, leading to confusion about which repository was being targeted.
  2. First-time worktree creation previously prompted users to select a port strategy, adding friction to creating worktrees when users just want automatic non-colliding ports.
- **Decision Made:**
  - **Silent port allocation on create:** `ensureConfig()` automatically uses the `offset` strategy without prompting the user. Interactive strategy configuration is an explicit, on-demand choice via `para config` (CLI) and `ParaSpace: Configure Port Strategy…` (VS Code).
  - **Multi-repository discovery and selection:**
    - Discover all git repository roots across workspace folders.
    - All discovered repositories are selected by default.
    - Added `ParaSpace: Select Repositories to Include…` (`paraSpace.selectRepositories`, filter icon in view title) so users can uncheck/remove or re-include any repository in the workspace. Selections persist per workspace in `workspaceState`.
    - `WorktreeStore` tracks and updates worktrees for all included repositories.
    - Tree views (`paraSpace.worktrees` and `paraSpace.ledger`) group entries by repository when >1 repository is included; single-repo workspaces remain flat.
    - Worktree actions (Create, Configure, Open History) prompt for the repository when invoked from the view title in a multi-repo workspace, or automatically target the selected repository node when invoked from a repository's context menu.
    - The switcher (`paraSpace.listWorktrees`) displays worktrees across all included repositories, prefixing each with `[<repo>]`.
- **Problem Solved:** Eliminates prompt friction during `create` and seamlessly supports multi-root workspaces with multiple concurrent repositories.

## D-038 — Searchable branch selection and multi-repo workspace provisioning on create
- **Status:** Accepted · 2026-10-21
- **Requirement Context:**
  1. In the VS Code extension, selecting a branch required manually typing the branch name in an input box, even when checking out an existing branch. Users had to remember branch names instead of browsing or filtering existing branches.
  2. In multi-repo workspaces (e.g. 2 repos like frontend & backend), clicking Create Worktree asked the user to choose between the 2 repositories, instead of letting them choose a subset and create a workspace across that selection.
- **Decision Made:**
  - **Searchable branch QuickPick:** `pickBranch` presents a searchable QuickPick populated with existing local branches. Users can filter and select existing branches with 1 click without retyping, or type a new branch name to see a `$(plus) Create new branch "<name>"` action. Selecting an existing branch skips the base branch prompt; creating a new branch proceeds to base branch selection.
  - **Repository selection:** At workspace level, creation lists all detected repositories in a searchable multi-select picker. Repositories currently included in ParaSpace are checked by default; users can choose a subset, but must select at least one. A repository-node context action continues to target that one repository without showing the multi-select picker.
  - **Branch selection:** For multiple selected repositories, the default path selects one existing branch available in every selected repo, or creates the same new branch in all of them. New branches prompt for a base independently per repository. The Advanced path lets users select or create a branch separately in each repo. A branch existing in only some selected repos must be resolved through Advanced.
  - **Review and provision:** Before changes are made, a confirmation summarizes repositories, branch names, and bases. On success, ParaSpace generates a `.code-workspace` file containing the resulting worktrees and offers to open it in a new window. If creation fails partway through, earlier worktrees are rolled back and rollback failures are reported.
- **Problem Solved:** Eliminates manual branch typing with a smooth searchable picker and enables full multi-repository workspace workflows in VS Code.

## D-039 — Multi-repository workspace CLI command `para workspace create`
- **Status:** Accepted · 2026-10-21
- **Requirement Context:** `para create <branch>` provisions a worktree for the single repository in `process.cwd()`. To manage parallel multi-repo setups from the terminal (e.g. frontend + backend), developers and scripts need a way to discover repositories, choose a shared branch or per-repo branches, provision parallel worktrees across all of them, and emit a `.code-workspace` file without changing existing single-repo scripts.
- **Decision Made:**
  - **New command:** Added `para workspace create [branch]` (with alias `para ws`).
  - **Shared workspace logic in `@para-space/core`:** Moved `sharedBranches`, `buildMultiRepoWorkspaceConfig`, `multiRepoWorkspaceFilePath`, and added `discoverWorkspaceRepoRoots` to core, so CLI and extension share the exact same behavior and validation.
  - **Discovery:** If `--repo <path...>` is omitted, automatically discovers repositories from cwd, any `.code-workspace` file in cwd, and immediate subdirectories. When multiple repos exist and interactive, prompts via `@clack/prompts` `multiselect` with all pre-selected by default.
  - **Branch selection:** Supports shared branch selection across all repos or `--per-repo` / interactive Advanced selection per repository. If a branch name is given as an argument, verifies presence across repositories, creates new branches if absent, and warns or routes to per-repo selection if it exists in only some repositories.
  - **Safety & Rollback:** Reviews the plan before creating; if any repository fails during provisioning, all previously created worktrees are automatically rolled back.
  - **Output:** Writes a `.code-workspace` file grouping the new worktrees, prints formatted summaries with ports, or emits JSON when `--json` is supplied.
- **Problem Solved:** Brings full multi-repo parallel workspace capabilities to the CLI with both interactive and non-interactive scriptable support while preserving single-repo `para create` behavior.

## D-040 — Workspace Peacock color injection, automatic window launch, and IDE agent programmatic API
- **Status:** Accepted · 2026-10-21
- **Requirement Context:**
  1. In multi-repo workspaces, opening the `.code-workspace` file did not color the VS Code window because VS Code ignores folder-level `.vscode/settings.json` window customizations when running inside a multi-root workspace file.
  2. After creating a worktree or workspace, VS Code showed an information toast requiring the user to manually click "Open in New Window", interrupting the workflow.
  3. Developers and AI coding agents (Copilot, Claude, Cursor) need to programmatically provision parallel workspaces and worktrees without interactive GUI prompts.
- **Decision Made:**
  - **Peacock in `.code-workspace`:** `buildMultiRepoWorkspaceConfig` now accepts a `colorProfile` and injects `workbench.colorCustomizations` into `.code-workspace` top-level `settings`. Workspaces default to having IDE colors enabled (`ide: 'yes'`), immediately giving the multi-root window its distinct OKLCH Peacock frame.
  - **Automatic window opening:** Removed the modal confirmation prompt and toast button click. The extension automatically invokes `openInNewWindow` immediately upon successful provisioning, showing a non-blocking notification toast with port and path details.
  - **IDE Agent Programmatic API:** `paraSpace.createWorktree` accepts structured programmatic options (`branch`, `repos`, `base`, `requirement`, `ide`). When provided by an AI agent or script, it executes non-interactively without opening QuickPick dialogs. Additionally, agents can execute `para workspace create <branch> --yes -r "<req>" --json` in terminal.
- **Problem Solved:** Restores window coloring in multi-root workspaces, opens new windows automatically without click delays, and allows AI IDE agents to provision workspaces seamlessly.

## D-041 — Persistent multi-repo workspace records, tree view workspace nodes, and switcher reopening
- **Status:** Accepted · 2026-10-21
- **Requirement Context:** When a developer closes a multi-repo workspace window (consisting of 2+ repositories and a `.code-workspace` file), returning to the main window or switching workspaces offered no way to reopen that parallel workspace as a unified multi-root window. Individual worktrees could be reopened, but the parallel multi-repo workspace connection was lost.
- **Decision Made:**
  - **Machine state tracking:** `state.json` now records multi-repository workspaces under `workspaces` (`WorkspaceRecord`: file path, branch, participating repositories, worktree paths, color). Creating a workspace via the extension or CLI registers it atomically via `saveWorkspaceRecord`.
  - **Quick switcher inclusion:** `paraSpace.listWorktrees` (the switcher opened via Command Palette or status bar click) displays active multi-repo workspaces right below "Create Worktree…" using `$(root-folder) [Workspace] <branch>`, listing member repos. Selecting one opens the `.code-workspace` file in a new window.
  - **Sidebar tree view integration:** Multi-repo workspaces appear at the top of the Worktrees view with dedicated `WorkspaceNode` items. Clicking the inline "Open in New Window" action launches the workspace; expanding the node reveals the member repository worktrees.
  - **New command:** Added `paraSpace.openWorkspace` ("Open Workspace…") to the Command Palette and view menus.
  - **CLI `para workspace list`:** Added `list` (`ls`) subcommand to `para workspace` to inspect and output registered workspaces.
- **Problem Solved:** Developers can close and easily reopen multi-repo parallel workspaces at any time from the status bar switcher, sidebar tree view, Command Palette, or CLI.

## D-042 — Automatic on-disk workspace discovery, container folder scanning, and browse dialog
- **Status:** Accepted · 2026-10-22
- **Requirement Context:**
  1. Workspaces created prior to D-041 or on disk without an active `state.workspaces` entry were invisible in the ParaSpace switcher and tree view.
  2. Opening a container directory (such as `/Users/sarthak/Desktop/Tripare`) that is not a git repository itself failed to discover the repositories and worktrees inside it.
  3. Developers had no way to browse and open a `.code-workspace` file from disk if it was not already tracked.
- **Decision Made:**
  - **On-disk `.code-workspace` auto-discovery:** `getWorkspaceRecords()` scans candidate directories (project directories, parent directories of known repos and worktrees, and `cwd`) for `.code-workspace` files. Any valid multi-repo workspace file is automatically parsed, enriched with worktree branch/color data, and registered in `state.json`.
  - **Container folder discovery:** `discoverRepoRoots()` falls back to scanning subdirectories and workspace files via `discoverWorkspaceRepoRoots()` when an open folder is not a Git repo itself.
  - **Browse action in Open Workspace:** `paraSpace.openWorkspace` offers a `$(file-code) Browse for workspace file…` option that opens a native file dialog, parses and registers the selected `.code-workspace`, and opens it in a new window.
- **Problem Solved:** Existing multi-repo workspaces (such as `Untitled-feat-TRI-7402.code-workspace` for the visa feature) are immediately recognized, colored, and openable from the switcher, sidebar, Command Palette, or CLI.

## D-043 — Zero-config AI agent architecture: VS Code Language Model Tools and CLI MCP Server
- **Status:** Accepted · 2026-10-22
- **Requirement Context:** Developers cannot be expected to commit vendor-specific AI instruction files (`.github/copilot-instructions.md`, `CLAUDE.md`, `.cursorrules`) to every project repository. AI coding agents (Copilot, Claude Code, Cursor) must have zero-config context and tool access at the IDE and environment level across all repositories on the machine.
- **Decision Made:**
  - **VS Code Language Model Tools API:** Extension contributes `para_create_workspace`, `para_open_workspace`, `para_list_worktrees`, and `para_isolate_worktree` via `contributes.languageModelTools` and `vscode.lm.registerTool`. GitHub Copilot Chat discovers and invokes these tools natively with zero files added to any repository.
  - **Model Context Protocol (MCP) Server:** Added `para mcp` stdio server using `@modelcontextprotocol/sdk`. Exposes the four canonical ParaSpace tools with Zod validation.
  - **Global 1-Click Agent Setup:** Added `para setup-agent` (`para init-agent`) command that registers the ParaSpace MCP server in `~/.claude.json`, `~/.cursor/mcp.json`, Windsurf, and Claude Desktop.
- **Problem Solved:** Enables AI agents across the entire ecosystem to create and switch parallel workspaces natively without repository pollution.

## D-044 — Adopt MIT License for open-source distribution
- **Status:** Accepted · 2026-10-23
- **Requirement Context:** Preparing ParaSpace (`@para-space/core`, `@para-space/cli`, and `para-space-vscode`) for public open-source distribution on GitHub, npm, and the VS Code Marketplace required replacing the `"UNLICENSED"` placeholder with a standard open-source license.
- **Decision Made:** License the repository and all packages under the permissive `MIT` license (`Copyright (c) 2026 Sarthak Jain`), placing `LICENSE` at the repository root and inside `packages/vscode-extension/` for `.vsix` bundling, and setting `"license": "MIT"` across all `package.json` manifests.
- **Problem Solved:** Provides clear open-source usage terms for developers and satisfies npm and VS Code Marketplace licensing requirements.

## D-045 — Self-contained CLI bundle and public registry metadata
- **Status:** Accepted · 2026-10-23
- **Requirement Context:** Publishing `@para-space-dev/cli` and `para-space-vscode` publicly required resolving the internal `"@para-space/core": "workspace:*"` dependency, choosing an available npm organization scope (`@para-space-dev`, since `paraspace` already existed on npm), adding a Marketplace PNG icon, and configuring publisher and registry metadata.
- **Decision Made:**
  - **Self-contained CLI bundle:** Renamed the CLI package to `@para-space-dev/cli`, added `packages/cli/tsup.config.ts` with `noExternal: ['@para-space/core']`, moved `@para-space/core` to `devDependencies` in `packages/cli/package.json`, declared `get-port` as a direct runtime dependency of `@para-space-dev/cli`, and marked `@para-space/core` `"private": true`. Both `@para-space-dev/cli` and `para-space-vscode` now inline `@para-space/core` at build time.
  - **Marketplace & npm metadata:** Kept `"publisher": "para-space"`, removed `"private": true`, added a 256×256 `media/icon.png` store icon, and added `repository`, `homepage`, `bugs`, `keywords`, and `engines` across package manifests.
- **Problem Solved:** Allows `@para-space-dev/cli` to be installed cleanly from npm as a single package (`npm install -g @para-space-dev/cli`) without publishing internal workspace packages, and makes `para-space-vscode` ready for Visual Studio Marketplace and Open VSX publishing.

## D-046 — Automated GitHub Actions CI and tag-driven release pipeline
- **Status:** Accepted · 2026-10-23
- **Requirement Context:** Public open-source contributors and users need automated verification on every push/PR across operating systems and Node.js versions, as well as repeatable release packaging for GitHub Releases, npm, the VS Code Marketplace, and Open VSX.
- **Decision Made:**
  - **CI Workflow (`.github/workflows/ci.yml`):** Runs on pushes to `main` and pull requests. Executes `pnpm format:check` and `pnpm typecheck`, followed by a matrix build and test job across `ubuntu-latest` and `macos-latest` on Node 20 and Node 22, plus `.vsix` packaging validation.
  - **Release Workflow (`.github/workflows/release.yml`):** Triggers on `v*.*.*` tags and `workflow_dispatch`. Runs full verification, packages the `.vsix` and `@para-space/cli` tarball, publishes a GitHub Release with both artifacts attached using `GITHUB_TOKEN`, and conditionally publishes to npm (`NPM_TOKEN`), Visual Studio Marketplace (`VSCE_PAT`), and Open VSX (`OVSX_PAT`) when secrets are configured.
- **Problem Solved:** Guarantees cross-platform quality on every commit and automates `v*.*.*` releases even before external registry secrets are configured.

## D-047 — Review new APIs and block deprecated TypeScript APIs in CI
- **Status:** Accepted · 2026-10-24
- **Requirement Context:** Contributors need a consistent way to avoid adopting deprecated third-party APIs, and the use of `McpServer.tool()` showed that TypeScript typechecking alone does not reject APIs marked `@deprecated`.
- **Decision Made:**
  - Before adopting an unfamiliar third-party API, inspect its installed type declarations and official documentation; prefer documented, non-deprecated replacements.
  - Add type-aware ESLint enforcement with `@typescript-eslint/no-deprecated`, expose it as `pnpm lint`, and run it in the required CI verification job.
  - Permit a deprecated API only through a narrow, reasoned suppression with a tracked follow-up issue.
- **Problem Solved:** Makes API lifecycle review a contributor protocol and catches accidental references to deprecated TypeScript APIs before merge.

---

## Open Questions

1. **Monorepo nested `node_modules`** — only the root `node_modules` is linked; per-package `node_modules` in workspaces is Phase 4.
2. **Python port keys** — Django/Flask don't read `PORT` by default; should the Python strategy suggest framework-specific keys?

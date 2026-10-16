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

---

## Open Questions

1. **Monorepo nested `node_modules`** — only the root `node_modules` is linked; per-package `node_modules` in workspaces is Phase 4.
2. **Python port keys** — Django/Flask don't read `PORT` by default; should the Python strategy suggest framework-specific keys?

# ParaSpace

Parallel workspace orchestrator for multi-agent and multi-task IDE workflows: Git worktrees with zero-duplication dependency sharing, per-worktree ports, and opt-in IDE window coloring. Ships as a CLI (`para`) and a VS Code extension.

> Status: Phase 1 (core engine + `para` CLI), Phase 2 (VS Code extension UI: worktrees sidebar, status bar indicator, quick switcher, context history ledger view, and port strategy configuration), and Phase 3 (Safety, Watchers & Dependency Divergence Detection: manifest watchers, `para check`, divergence warning indicators, and 1-click breakaway isolation) are implemented. Phase 4 (Monorepo & Ecosystem Expansion) is next.

## Quick start

Requires Node ≥ 18, git ≥ 2.31, pnpm.

```bash
pnpm install
pnpm build
pnpm test                       # unit + integration (temp git repos)
pnpm format                     # Prettier (pnpm format:check in CI)
# pnpm install also installs a pre-commit hook that runs Prettier on staged files
(cd packages/cli && npm link)   # optional: puts `para` on PATH
pnpm package:extension          # packages the VS Code extension .vsix
```

```bash
para create feat/TK-101 --base main -r "Auth redesign"   # ../<repo>-feat-TK-101
para list
para isolate feat/TK-101        # break the shared node_modules/.venv link
para remove feat/TK-101 --delete-branch
```

**VS Code extension (development):** open this repo in VS Code and press **F5** (Run → "Run ParaSpace Extension"). It builds core and the extension, then opens an Extension Development Host window. In that window, open any git repo and click the **ParaSpace** icon in the activity bar, or run **ParaSpace: List Worktrees** from the Command Palette. Logs are in the Output panel under "ParaSpace".

The first `create` in a repo asks for a port strategy and saves it to `.para-space.json`, which you should commit. For agents and scripts, pass `--yes`, and optionally `--port-strategy <offset|scan|pool|passthrough>` and `--ide`. Nothing will prompt.

## Layout

| Path | What |
| :--- | :--- |
| `packages/core/src/commands/` | One file per flow (`create`, `list`, `isolate`, `remove`, first-run `config`). No terminal I/O. |
| `packages/core/src/{frameworks,ports}/` | Strategy patterns: Node/Python/Env and offset/scan/pool/passthrough |
| `packages/core/src/util/` | Shared helpers (exec, fs, markdown formatting) |
| `packages/cli/src/commands/` | One file per `para` command; `runtime.ts` holds the shared logger, prompter choice and error handling |
| `packages/vscode-extension/src/` | `extension.ts` (activation wiring), `commands/` (one file per command), `tree.ts` (sidebar), `store.ts` (the one place worktrees are loaded), `statusbar.ts`, `refresh.ts` (auto-refresh), `prompter.ts` (VS Code `Prompter`), `runtime.ts` (logger, errors, dialogs), `workspace.ts`, and the vscode-free `items.ts` / `dialogs.ts`; bundled with core into one CommonJS file |
| `.vscode/launch.json`, `tasks.json` | F5 launch config for developing the extension |

## Documentation

| File | What it holds |
| :--- | :--- |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Full specification, architecture and phased roadmap |
| [DECISIONS.md](DECISIONS.md) | Decision log — why each design choice was made, plus open questions |
| [FLOW.md](FLOW.md) | How each operation works step by step (current intended behavior) |
| [GUIDELINES.md](GUIDELINES.md) | Rules every contributor follows; updated whenever a new rule is agreed |
| [VISUAL_BRIEF.md](VISUAL_BRIEF.md) | Project context for generating images, diagrams and posts with AI tools |

## Contributing

Every contributor, human or AI agent, follows **[GUIDELINES.md](GUIDELINES.md)**: living docs after every change, code structure, comments, concurrency, safety, testing and commits. When a new working rule is agreed, it is added there.

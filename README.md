# ParaSpace

[![CI](https://github.com/SarthakJain23/para-space/actions/workflows/ci.yml/badge.svg)](https://github.com/SarthakJain23/para-space/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Parallel workspace orchestrator for multi-agent and multi-task IDE workflows: Git worktrees with zero-duplication dependency sharing, per-worktree ports, and opt-in IDE window coloring. Ships as a CLI (`para`) and a VS Code extension.

> Status: Phase 1 (core engine + `para` CLI), Phase 2 (VS Code extension UI: worktrees sidebar, status bar indicator, quick switcher, context history ledger view, and port strategy configuration), Phase 3 (Safety, Watchers & Dependency Divergence Detection: manifest watchers, `para check`, divergence warning indicators, and 1-click breakaway isolation), Multi-Repository Workspaces (`para workspace`, `.code-workspace` provisioning, auto-discovery, and switcher reopening), and Zero-Config AI Agent Integration (VS Code Language Model Tools + `para mcp` Server) are implemented. Phase 4 (Monorepo Nested Packages & Ecosystem Expansion) is next.

## Installation

Requires **Node.js ≥ 18** and **Git ≥ 2.31**.

### CLI (`para`)

Install globally with your preferred package manager:

```bash
# npm
npm install -g @para-space-dev/cli

# pnpm
pnpm add -g @para-space-dev/cli

# yarn
yarn global add @para-space-dev/cli

# bun
bun add -g @para-space-dev/cli
```

```bash
# Optional: register the ParaSpace MCP server with Claude Code, Cursor, Windsurf & Claude Desktop
para setup-agent
```

### VS Code Extension

Install **ParaSpace** (`para-space.para-space-vscode`) from the VS Code Marketplace, or install from a packaged `.vsix`:

```bash
code --install-extension para-space-vscode-0.1.5.vsix
```

---

## Quick start

```bash
para create feat/TK-101 --base main -r "Auth redesign"   # ~/.para-space/worktrees/<project>/<repo>-feat-TK-101
para workspace create feat/TK-101                        # multi-repo: provisions all repos & .code-workspace
para workspace add feat/TK-101 --repo ./mobile           # add another repo to an existing multi-repo workspace
para workspace list                                      # list tracked & discovered multi-repo workspaces
para workspace open feat/TK-101                          # reopen multi-repo workspace in VS Code
para workspace remove feat/TK-101                        # remove tracked multi-repo workspace
para list
para check                      # detect manifest divergence across worktrees
para isolate feat/TK-101        # break the shared node_modules/.venv link
para remove feat/TK-101 --delete-branch
```

The first `create` in a repo automatically uses the `offset` strategy, saves it to `.para-space.json`, and excludes both `.para-space/` and `.para-space.json` in `.git/info/exclude` so your repository stays clean. To configure a different strategy (`scan`, `pool`, `passthrough`), run `para config` or use **ParaSpace: Configure Port Strategy…** in VS Code. For agents and scripts, pass `--yes`, and optionally `--port-strategy <offset|scan|pool|passthrough>` and `--ide`. Nothing will prompt.

---

## Multi-Repository Workspaces Workflow

When a feature spans multiple repositories (for example, `frontend` + `backend` inside a parent folder or an existing `.code-workspace`), ParaSpace provisions and manages them as a unified multi-root workspace:

1. **Automatic Repository Discovery:**
   - Discovers Git repositories from the current directory, any `.code-workspace` file in the directory, or immediate child folders (so opening a parent container folder in VS Code or the terminal works out of the box).
2. **Flexible Branch Planning:**
   - **Shared branch mode:** Check out an existing branch present across all selected repositories, or create the same new branch across all of them.
   - **Per-repository mode (`--per-repo` / Advanced):** Select or create different branches and base refs for each repository individually.
3. **Atomic Provisioning & Rollback:**
   - Synchronizes each repository's base branch with `origin`, then provisions each selected repository's worktree under `~/.para-space/worktrees/<project>/<repo>-<branch-slug>` with symlinked dependencies (`node_modules`, `.venv`, `.env`) and dedicated `.env.local` ports.
   - If provisioning fails on any repository, ParaSpace automatically rolls back the worktrees already created in that run.
4. **`.code-workspace` Generation & Window Coloring:**
   - Generates a `<name>-<branch-slug>.code-workspace` file in `~/.para-space/workspaces/` linking all provisioned worktrees, injects the OKLCH Peacock window color profile into top-level workspace `settings`, registers the workspace in `~/.para-space/state.json`, and opens it in a new VS Code window.
5. **Reopening & Switching Workspaces:**
   - **VS Code:** Reopen any multi-repo workspace from the **Worktrees** sidebar (top-level `Workspace` nodes), the status bar **Quick Switcher** (`$(root-folder) [Workspace] <branch>`), or **ParaSpace: Open Workspace…** (which also includes a **Browse for workspace file…** dialog to import any `.code-workspace` from disk).
   - **CLI:** Run `para workspace list` (`para ws ls`) to inspect workspaces or `para workspace open <branch|name|path>` to launch in VS Code.

---

## Development

Requires Node ≥ 18, git ≥ 2.31, pnpm.

```bash
pnpm install
pnpm build
pnpm test                       # unit + integration (temp git repos)
pnpm format                     # Prettier (pnpm format:check in CI)
# pnpm install also installs a pre-commit hook that runs Prettier on staged files
(cd packages/cli && pnpm link --global) # or `npm link`: puts `para` on PATH
pnpm package:extension          # packages the VS Code extension .vsix
```

**VS Code extension (development):** open this repo in VS Code and press **F5** (Run → "Run ParaSpace Extension"). It builds core and the extension, then opens an Extension Development Host window. In that window, open any git repo and click the **ParaSpace** icon in the activity bar, or run **ParaSpace: List Worktrees** from the Command Palette. Logs are in the Output panel under "ParaSpace".

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
| [REUSABLE_COMPONENTS.md](REUSABLE_COMPONENTS.md) | Living catalog of reusable orchestrators, handlers, prompts, and utilities across all packages |
| [AGENT_INTEGRATION.md](AGENT_INTEGRATION.md) | Guide for AI coding agents (Claude Code, Copilot, Cursor) to automate ParaSpace |
| [VISUAL_BRIEF.md](VISUAL_BRIEF.md) | Project context for generating images, diagrams and posts with AI tools |
| [CHANGELOG.md](CHANGELOG.md) | Release history and notable changes |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributor onboarding and PR checklist |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting policy |

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** and **[GUIDELINES.md](GUIDELINES.md)**: living docs after every change, code structure, comments, concurrency, safety, testing and commits. When a new working rule is agreed, it is added there.

## License

[MIT](LICENSE)


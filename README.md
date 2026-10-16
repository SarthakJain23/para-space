# ParaSpace

Parallel workspace orchestrator for multi-agent and multi-task IDE workflows: Git worktrees with zero-duplication dependency sharing, per-worktree ports, and opt-in IDE window coloring. Ships as a CLI (`para`) and a VS Code extension.

> Status: Phase 1 (core engine + `para` CLI) implemented. VS Code extension (Phase 2) and file watchers (Phase 3) are not built yet.

## Quick start

Requires Node ≥ 18, git ≥ 2.31, pnpm.

```bash
pnpm install
pnpm build
pnpm test                       # unit + integration (temp git repos)
pnpm format                     # Prettier (pnpm format:check in CI)
# pnpm install also installs a pre-commit hook that runs Prettier on staged files
pnpm --filter @para-space/cli link --global   # optional: puts `para` on PATH
```

```bash
para create feat/TK-101 --base main -r "Auth redesign"   # ../<repo>-feat-TK-101
para list
para isolate feat/TK-101        # break the shared node_modules/.venv link
para remove feat/TK-101 --delete-branch
```

The first `create` in a repo asks for a port strategy and saves it to `.para-space.json`, which you should commit. For agents and scripts, pass `--yes`, and optionally `--port-strategy <offset|scan|pool|passthrough>` and `--ide`. Nothing will prompt.

## Layout

| Path | What |
| :--- | :--- |
| `packages/core/src/commands/` | One file per flow (`create`, `list`, `isolate`, `remove`, first-run `config`). No terminal I/O. |
| `packages/core/src/{frameworks,ports}/` | Strategy patterns: Node/Python/Env and offset/scan/pool/passthrough |
| `packages/core/src/util/` | Shared helpers (exec, fs, markdown formatting) |
| `packages/cli/src/commands/` | One file per `para` command; `runtime.ts` holds the shared logger, prompter choice and error handling |

## Documentation

| File | What it holds |
| :--- | :--- |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Full specification, architecture and phased roadmap |
| [DECISIONS.md](DECISIONS.md) | Decision log — why each design choice was made, plus open questions |
| [FLOW.md](FLOW.md) | How each operation works step by step (current intended behavior) |

## Keeping the docs current — after every change

This applies to every contributor, human or AI agent. After any change to code, design, scope, config format, or behavior, update both files as part of the same change:

- **[DECISIONS.md](DECISIONS.md)** — append a new `D-NNN` entry (Requirement Context / Decision Made / Problem Solved) and add it to the index. Never edit an accepted entry; supersede it with a new one. Move resolved items out of Open Questions.
- **[FLOW.md](FLOW.md)** — edit the affected flow section in place, update its `Status` / `Last updated` / `Decisions` line, and add a changelog row.

Pure refactors with no behavior change still get a FLOW.md changelog row if they move components; skip DECISIONS.md only when no choice was made.

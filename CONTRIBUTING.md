# Contributing to ParaSpace

Thank you for your interest in contributing to **ParaSpace**!

## Essential Reading

Before making changes, please review our living project docs:

1. **[GUIDELINES.md](./GUIDELINES.md)** — The single source of truth for contributor rules: code structure, TSDoc comments, concurrency/locking rules, environment safety, testing, formatting, and living documentation requirements.
2. **[DECISIONS.md](./DECISIONS.md)** — Architectural and behavioral decision log (`D-001` through `D-045`). Any change that introduces a new design, scope, or behavioral choice must add a `D-NNN` entry in the same commit.
3. **[FLOW.md](./FLOW.md)** — Step-by-step system flows for every ParaSpace operation.

## Development Setup

### Prerequisites
- **Node.js** ≥ 18
- **Git** ≥ 2.31
- **pnpm** (managed via Corepack or installed globally)

### Commands

```bash
# Install dependencies and set up pre-commit Prettier hooks
pnpm install

# Build all packages (@para-space/core, @para-space/cli, para-space-vscode)
pnpm build

# Run TypeScript typechecking across all packages
pnpm typecheck

# Run unit and integration tests (uses sandboxed temporary git repos)
pnpm test

# Check formatting with Prettier
pnpm format:check
```

## Pull Request Checklist

- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm format:check` all pass.
- [ ] New behavior includes unit and/or integration tests.
- [ ] Exported functions in `@para-space/core` include TSDoc comments.
- [ ] [DECISIONS.md](./DECISIONS.md) and [FLOW.md](./FLOW.md) are updated if any architectural choice or operational flow changed.
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat(core): ...`, `fix(cli): ...`, `docs: ...`).

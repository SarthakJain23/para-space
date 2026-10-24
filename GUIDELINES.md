# ParaSpace — Contributor Guidelines

Rules for everyone working in this repo, human or AI agent. Follow them in every change.

**How to update:** whenever a new working rule or protocol is agreed, add it here in the same change, as a numbered rule in the right section with a link to the decision behind it (if any). Edit a rule in place when it changes, and add a row to the changelog at the bottom. Keep rules generic: this file is the single place for contributor rules, and tool-specific instruction files (e.g. `CLAUDE.md`) are not used (D-029).

---

## 1. Living documentation — after every change

1.1. **[DECISIONS.md](DECISIONS.md):** any change that makes a choice (design, scope, config format, behavior, convention) gets a new `D-NNN` entry (Requirement Context / Decision Made / Problem Solved) and an index row. Use the next free number; check the index first.
1.2. Never edit an accepted decision. Supersede it with a new entry and mark the old one `Superseded by D-NNN`. Move resolved items out of **Open Questions**.
1.3. **[FLOW.md](FLOW.md):** edit the affected flow section in place, update its `Status` / `Last updated` / `Decisions` line, and add a changelog row.
1.4. Pure refactors with no behavior change still get a FLOW.md changelog row if they move components. Skip DECISIONS.md only when no choice was made.
1.5. Docs are updated in the **same commit** as the code they describe.

## 2. Code structure

2.1. Keep code clean and modules **orthogonal**: one responsibility per module, no hidden coupling (D-023).
2.2. Split long files logically: one command/flow per file in `core/src/commands/` and `cli/src/commands/`.
2.3. **DRY:** repeated patterns go into shared helpers (`util/`, `link.ts`, `frameworks/shared.ts`, …). Don't leave unused interface members.
2.4. Match the surrounding code's naming, idioms and comment density.
2.5. **Core never does terminal I/O.** It takes a `Prompter` and `Logger` from the caller; with no prompter it runs non-interactively (D-020). The CLI and the VS Code extension are thin front ends over core.
2.6. New ecosystems or port behaviors are added as **strategies** (`FrameworkStrategy`, `PortStrategy`), not as conditionals in commands (D-004, D-005).
2.7. **API adoption protocol ([D-047](DECISIONS.md)):** Before using an unfamiliar third-party API, inspect its installed type declaration and official documentation. Do not adopt APIs marked `@deprecated`; use the documented replacement. If a deprecated API is temporarily unavoidable, add a narrow lint suppression with a reason and a follow-up issue. Run `pnpm lint`; CI enforces this with `@typescript-eslint/no-deprecated`.

## 3. Comments

3.1. Everything exported from `@para-space/core` (plus key internals like `withFileLock`, `updateRepoState`) gets **TSDoc**: summary, responsibility and constraints, `@param` / `@returns` / `@throws` where they add something beyond the types, and an `@example` (D-028).
3.2. Internal helpers get at most **one line explaining why**, not what. Self-explanatory functions get none.
3.3. Point to `D-NNN` decisions and FLOW.md sections instead of repeating them.

## 4. State and concurrency

4.1. Every write to `~/.para-space/state.json` goes through `updateRepoState`, which holds `state.lock` (D-027). Never call `writeState` directly from commands.
4.2. Keep `updateRepoState` callbacks short: no installs or slow git calls inside the lock.
4.3. The lock is **not re-entrant**: never call `updateRepoState` (or `withFileLock` on the same path) from inside another one.

## 5. Safety for the user's environment

5.1. Never modify `.vscode/settings.json` or other personal settings without explicit consent (`--ide` or a prompt) (D-006).
5.2. Never delete through a symlink: unlink shared links before removing a worktree, so the main repo's dependencies survive (D-022).
5.3. Any multi-step operation that can fail halfway must roll back what it created (D-022).

## 6. Testing

6.1. Every behavior change gets a test. Pure logic goes in `test/unit.test.ts`; flows go in `test/integration.test.ts`, which runs against real temporary git repos with `PARA_SPACE_HOME` sandboxed.
6.2. Before finishing a change, all of these pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`.
6.3. In the VS Code extension, keep logic that doesn't need the VS Code API in modules that never import `vscode` (e.g. `items.ts`), and unit-test those with vitest. `extension.ts` only wires commands and UI to core (D-030).

## 7. Formatting and commits

7.1. Prettier formats all code (not Markdown docs); config in `.prettierrc.json` (D-024). The pre-commit hook formats staged files automatically (D-025).
7.2. Commit messages use Conventional Commits: `feat(core): …`, `fix(cli): …`, `docs: …`, `chore: …`, with a body explaining why.
7.3. Commit only the files belonging to the change; leave unrelated working-tree edits out.

---

## Changelog

| Date | Change | Rules |
| :--- | :--- | :--- |
| 2026-10-16 | Initial guidelines, collected from README, DECISIONS.md and agreed working rules | All |
| 2026-10-17 | Added rule for testable, vscode-free extension modules | 6.3 |
| 2026-10-24 | Added API review protocol and CI enforcement for deprecated TypeScript APIs | 2.7 |

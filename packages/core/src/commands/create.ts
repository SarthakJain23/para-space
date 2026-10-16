import path from 'node:path';
import { type ColorProfile, colorForIndex, peacockSettings } from '../colors.js';
import type { ParaSpaceConfig } from '../config.js';
import { upsertEnvFile } from '../envfile.js';
import { type FrameworkStrategy, detectStrategies } from '../frameworks/index.js';
import * as git from '../git.js';
import { writeWorkspaceSettings } from '../ide.js';
import { excludeFromGit } from '../ignore.js';
import { appendLedger } from '../ledger.js';
import { unlinkIfSymlink } from '../link.js';
import { worktreePathFor } from '../paths.js';
import { allocateWorktreePort } from '../ports/index.js';
import { type Logger, type Prompter, silentLogger } from '../prompts.js';
import { type WorktreeRecord, nextWorktreeIndex, updateRepoState } from '../state.js';
import { code, codeList } from '../util/format.js';
import { exists } from '../util/fs.js';
import { type EnsureConfigOptions, ensureConfig } from './config.js';

export interface CreateOptions extends EnsureConfigOptions {
  branch: string;
  base?: string;
  /** `ask` (default) prompts via prompter; `yes`/`no` skip the prompt. */
  ide?: 'ask' | 'yes' | 'no';
  /** Why this worktree exists (ticket title, agent task) — goes into the ledger. */
  requirement?: string;
}

export interface CreateResult {
  mainRoot: string;
  path: string;
  branch: string;
  createdBranch: boolean;
  port?: number;
  color?: string;
  strategies: string[];
  links: string[];
  ideSettingsFile?: string;
}

/** Everything a provisioning step needs about the worktree being built. */
interface Ctx {
  mainRoot: string;
  wtPath: string;
  index: number;
  config: ParaSpaceConfig;
  strategies: FrameworkStrategy[];
  log: Logger;
}

/**
 * Creates a ready-to-use worktree for a branch: checkout, shared dependencies, port and IDE color.
 *
 * Steps: ensure `.para-space.json` (asks on first run) → `git worktree add` in `../<repo>-<slug>`
 * → reserve index and port under the state lock → symlink `node_modules` / `.venv` / `.env` →
 * write the port to `.env.local` → optional IDE settings → ledger entry. If any step after the
 * checkout fails, everything is rolled back (D-022). See FLOW.md §1.
 *
 * @param opts - `cwd` (any dir in the repo), `branch`, optional `base`, `requirement`, `ide`,
 *   `prompter` (omit for non-interactive), first-run port options and `log`.
 * @returns Where the worktree is, its port and color, and what was linked.
 * @throws If the target directory exists, git fails, or the port pool is exhausted.
 *
 * @example
 * const wt = await createWorktree({ cwd: '/code/app', branch: 'feat/TK-101', base: 'main', ide: 'no' });
 * // wt.path === '/code/app-feat-TK-101', wt.port === 3001
 */
export async function createWorktree(opts: CreateOptions): Promise<CreateResult> {
  const log = opts.log ?? silentLogger;
  const mainRoot = await git.mainRepoRoot(opts.cwd);
  const { config } = await ensureConfig(opts);

  const wtPath = worktreePathFor(mainRoot, opts.branch);
  if (await exists(wtPath)) throw new Error(`Target directory already exists: ${wtPath}`);

  log.info(`Creating worktree at ${wtPath}…`);
  const { createdBranch } = await git.worktreeAdd(mainRoot, wtPath, opts.branch, opts.base);

  const links: string[] = [];
  try {
    // Reserve only after `git worktree add`, so a concurrent `list` never prunes the reservation.
    const record = await reserveSlot(mainRoot, wtPath, opts.branch, config);
    const ctx: Ctx = {
      mainRoot,
      wtPath,
      index: record.index,
      config,
      strategies: await detectStrategies(mainRoot),
      log,
    };
    links.push(...(await linkShared(ctx)));
    await writePort(ctx, record.port);
    const ide = await applyIdeSettings(ctx, opts);

    Object.assign(record, { links, color: ide?.color.hex });
    await updateRepoState(mainRoot, (r) => {
      r.worktrees = r.worktrees.map((w) => (w.path === wtPath ? record : w));
    });
    await appendLedger(mainRoot, provisionedEntry(ctx, opts, record, createdBranch, ide?.color));

    return {
      mainRoot,
      path: wtPath,
      branch: opts.branch,
      createdBranch,
      port: record.port,
      color: record.color,
      strategies: ctx.strategies.map((s) => s.name),
      links,
      ideSettingsFile: ide?.file,
    };
  } catch (err) {
    log.warn(`Create failed, rolling back: ${(err as Error).message}`);
    await rollback(mainRoot, wtPath, links, opts.branch, createdBranch);
    throw err;
  }
}

/** Link shared deps/config from main and hide the links from git (D-002, D-013, D-019). */
async function linkShared({ mainRoot, wtPath, strategies, log }: Ctx): Promise<string[]> {
  const links: string[] = [];
  for (const s of strategies) links.push(...(await s.linkDependencies(mainRoot, wtPath, log)));
  const commonDir = await git.gitCommonDir(mainRoot);
  await excludeFromGit(commonDir, [...links.map((l) => path.relative(wtPath, l)), '.env.local']);
  return links;
}

/**
 * Claim the next index and a port and record the worktree, all under the state lock,
 * so concurrent creates never pick the same slot (D-004, D-027).
 */
function reserveSlot(mainRoot: string, wtPath: string, branch: string, config: ParaSpaceConfig) {
  return updateRepoState(mainRoot, async (r): Promise<WorktreeRecord> => {
    const others = r.worktrees.filter((w) => w.path !== wtPath);
    const index = nextWorktreeIndex(others);
    const record: WorktreeRecord = {
      branch,
      path: wtPath,
      index,
      port: await allocateWorktreePort(config, others, index),
      links: [],
      isolated: false,
      createdAt: new Date().toISOString(),
    };
    r.worktrees = [...others, record];
    return record;
  });
}

/** Write the reserved port to every configured env key in `.env.local`. */
async function writePort({ wtPath, config }: Ctx, port: number | undefined): Promise<void> {
  if (port === undefined) return;
  await upsertEnvFile(
    path.join(wtPath, '.env.local'),
    Object.fromEntries(config.envKeys.map((k) => [k, String(port)])),
  );
}

/** Write Peacock colors + strategy IDE settings, only with consent (D-006). */
async function applyIdeSettings(
  { mainRoot, wtPath, index, strategies }: Ctx,
  opts: Pick<CreateOptions, 'ide' | 'prompter'>,
): Promise<{ file: string; color: ColorProfile } | undefined> {
  const color = colorForIndex(index);
  const settings: Record<string, unknown> = { 'workbench.colorCustomizations': peacockSettings(color.hex) };
  for (const s of strategies) Object.assign(settings, await s.configureIdeSettings?.(mainRoot, wtPath));

  if (
    !(await hasIdeConsent(opts, {
      worktreePath: wtPath,
      color: `${color.name} ${color.hex}`,
      settings: Object.keys(settings),
    }))
  ) {
    return undefined;
  }
  return { file: await writeWorkspaceSettings(wtPath, settings), color };
}

async function hasIdeConsent(
  { ide = 'ask', prompter }: Pick<CreateOptions, 'ide' | 'prompter'>,
  details: Parameters<Prompter['confirmIdeSettings']>[0],
): Promise<boolean> {
  if (ide !== 'ask') return ide === 'yes';
  return prompter ? prompter.confirmIdeSettings(details) : false;
}

/** Undo a partially provisioned worktree, including its slot reservation (D-022). */
async function rollback(
  mainRoot: string,
  wtPath: string,
  links: string[],
  branch: string,
  createdBranch: boolean,
): Promise<void> {
  for (const l of links) await unlinkIfSymlink(l).catch(() => {});
  await git.worktreeRemove(mainRoot, wtPath, true).catch(() => {});
  if (createdBranch) await git.branchDelete(mainRoot, branch, true).catch(() => {});
  await updateRepoState(mainRoot, (r) => {
    r.worktrees = r.worktrees.filter((w) => w.path !== wtPath);
  }).catch(() => {});
}

function provisionedEntry(
  { wtPath, config, strategies }: Ctx,
  opts: CreateOptions,
  record: WorktreeRecord,
  createdBranch: boolean,
  color: ColorProfile | undefined,
) {
  const rel = (l: string) => path.relative(wtPath, l);
  return {
    title: `Worktree Provisioned: ${opts.branch}`,
    requirement: opts.requirement ?? `User started work on ${code(opts.branch)}.`,
    decisions: [
      `Created worktree at ${code(wtPath)} on ${
        createdBranch
          ? `new branch ${code(opts.branch)} from ${code(opts.base ?? 'HEAD')}`
          : `existing branch ${code(opts.branch)}`
      }.`,
      strategies.length
        ? `Strategies applied: ${codeList(strategies.map((s) => s.name))}; linked ${record.links.length ? codeList(record.links.map(rel)) : 'nothing'}.`
        : 'No framework strategies matched.',
      record.port !== undefined
        ? `Port strategy ${code(config.portStrategy)}: assigned port ${code(record.port)} (written to ${code('.env.local')} as ${codeList(config.envKeys)}).`
        : `Port strategy ${code(config.portStrategy)}: no port injected.`,
      color
        ? `${code('.vscode/settings.json')} window color set to ${color.name} ${code(color.hex)} (user approved).`
        : `${code('.vscode/settings.json')} left untouched (no consent).`,
    ],
    problemSolved:
      'Parallel branch checkout without re-installing dependencies, with a non-colliding dev port and a distinguishable IDE window.',
  };
}

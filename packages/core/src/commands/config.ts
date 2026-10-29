import {
  type ParaSpaceConfig,
  type PortStrategyName,
  CONFIG_FILE,
  DEFAULT_BASE_PORT,
  loadConfig,
  saveConfig,
} from '../config.js';
import { defaultEnvKeys } from '../frameworks/index.js';
import * as git from '../git.js';
import { excludeFromGit } from '../ignore.js';
import { LEDGER_DIR, appendLedger } from '../ledger.js';
import { type PortStrategyAnswer, type Prompter, silentLogger } from '../prompts.js';
import { code, codeList } from '../util/format.js';
import type { CommonOptions } from './types.js';

const LOCAL_METADATA_EXCLUDES = [`${LEDGER_DIR}/`, CONFIG_FILE];

export interface EnsureConfigOptions extends CommonOptions {
  /** Asked on first run unless `portStrategy` is given. */
  prompter?: Prompter;
  portStrategy?: PortStrategyName;
  basePort?: number;
  portPool?: string;
}

export interface UpdateConfigOptions extends CommonOptions {
  /** Prompter for interactive choices when fields are omitted. */
  prompter?: Prompter;
  portStrategy?: PortStrategyName;
  basePort?: number;
  portPool?: string;
  envKeys?: string[];
  reason?: string;
}

export interface UpdateConfigResult {
  config: ParaSpaceConfig;
  previous?: ParaSpaceConfig;
}

function chooseStrategy(opts: EnsureConfigOptions): PortStrategyAnswer {
  const basePort = opts.basePort ?? DEFAULT_BASE_PORT;
  return { portStrategy: opts.portStrategy ?? 'offset', basePort, portPool: opts.portPool };
}

/**
 * Loads the repo's `.para-space.json`, creating it on first run.
 *
 * On first run the port strategy comes from `opts.portStrategy`, defaulting to `offset`
 * without interrupting the user. It also adds `/.para-space/` and `/.para-space.json` to
 * `$GIT_COMMON_DIR/info/exclude` and writes a ledger entry (D-004, D-051). To configure a
 * different strategy interactively, use `updateConfig()` / `para config` /
 * `ParaSpace: Configure Port Strategy…`.
 *
 * @param opts - `cwd`, optional `portStrategy` / `basePort` / `portPool`.
 * @returns The config, and `created: true` if it was just written.
 * @throws If an existing `.para-space.json` is invalid.
 *
 * @example
 * const { config } = await ensureConfig({ cwd: '/code/app' });
 * // config → { portStrategy: 'offset', basePort: 3000, envKeys: ['PORT'] }
 */
export async function ensureConfig(opts: EnsureConfigOptions): Promise<{ config: ParaSpaceConfig; created: boolean }> {
  const log = opts.log ?? silentLogger;
  const mainRoot = await git.mainRepoRoot(opts.cwd);
  const commonDir = await git.gitCommonDir(mainRoot);
  const existing = await loadConfig(mainRoot);
  if (existing) {
    await excludeFromGit(commonDir, LOCAL_METADATA_EXCLUDES);
    return { config: existing, created: false };
  }

  const { portStrategy, basePort, portPool } = chooseStrategy(opts);
  const config: ParaSpaceConfig = { portStrategy, basePort, envKeys: await defaultEnvKeys(mainRoot) };
  if (portPool) config.portPool = portPool;
  await saveConfig(mainRoot, config);
  const excluded = await excludeFromGit(commonDir, LOCAL_METADATA_EXCLUDES);
  log.info(`Saved ${CONFIG_FILE} (portStrategy: ${portStrategy}).`);

  await appendLedger(mainRoot, {
    title: `Repository configured: port strategy ${code(portStrategy)}`,
    requirement: 'First ParaSpace worktree in this repository.',
    decisions: [
      `Port strategy ${code(portStrategy)}, base port ${code(basePort)}, env keys ${codeList(config.envKeys)} saved to ${code(CONFIG_FILE)}.`,
      ...(excluded.length
        ? [`Added ${codeList(excluded)} to ${code('.git/info/exclude')} (ParaSpace metadata stays local).`]
        : []),
    ],
    problemSolved: 'Future worktrees reuse this choice without prompting; dev servers get non-colliding ports.',
  });
  return { config, created: true };
}

/**
 * Reads the repository's `.para-space.json` configuration, if it exists.
 *
 * @param cwd - Working directory inside the repository or one of its worktrees.
 * @returns The main repository root and the loaded config (or undefined if unconfigured).
 *
 * @example
 * const { root, config } = await getConfig();
 * if (config) console.log(config.portStrategy);
 */
export async function getConfig(cwd: string = process.cwd()): Promise<{ root: string; config?: ParaSpaceConfig }> {
  const mainRoot = await git.mainRepoRoot(cwd);
  const config = await loadConfig(mainRoot);
  return { root: mainRoot, config };
}

/**
 * Updates the repository's `.para-space.json` configuration and logs the change to the context ledger (D-004, D-007).
 *
 * If fields are omitted and a prompter is supplied, the prompter asks the user for choices,
 * defaulting to the previous values. If no previous config exists, it creates one.
 *
 * @param opts - `cwd`, optional `prompter`, new configuration fields, and an optional `reason` for the ledger.
 * @returns The updated config and the previous config (if any).
 * @throws If values are invalid.
 *
 * @example
 * const { config } = await updateConfig({
 *   cwd: '/code/app',
 *   portStrategy: 'scan',
 *   reason: 'Avoid port clashes with Docker',
 * });
 */
export async function updateConfig(opts: UpdateConfigOptions): Promise<UpdateConfigResult> {
  const log = opts.log ?? silentLogger;
  const mainRoot = await git.mainRepoRoot(opts.cwd);
  const previous = await loadConfig(mainRoot);

  let portStrategy = opts.portStrategy;
  let basePort = opts.basePort;
  let portPool = opts.portPool;

  if (!portStrategy && opts.prompter) {
    const answer = await opts.prompter.selectPortStrategy({
      basePort: basePort ?? previous?.basePort ?? DEFAULT_BASE_PORT,
    });
    portStrategy = answer.portStrategy;
    basePort = answer.basePort;
    portPool = answer.portPool;
  } else if (!portStrategy) {
    portStrategy = previous?.portStrategy ?? 'offset';
  }

  basePort = basePort ?? previous?.basePort ?? DEFAULT_BASE_PORT;
  const envKeys = opts.envKeys ?? previous?.envKeys ?? (await defaultEnvKeys(mainRoot));

  const newConfig: ParaSpaceConfig = {
    portStrategy,
    basePort,
    envKeys,
  };
  if (portPool !== undefined) {
    newConfig.portPool = portPool;
  } else if (previous?.portPool !== undefined && portStrategy === 'pool') {
    newConfig.portPool = previous.portPool;
  }

  await saveConfig(mainRoot, newConfig);
  const commonDir = await git.gitCommonDir(mainRoot);
  const excluded = await excludeFromGit(commonDir, LOCAL_METADATA_EXCLUDES);
  log.info(`Updated ${CONFIG_FILE} (portStrategy: ${portStrategy}, basePort: ${basePort}).`);

  const decisions = [
    `Port strategy ${code(portStrategy)}, base port ${code(basePort)}, env keys ${codeList(envKeys)} saved to ${code(CONFIG_FILE)}.`,
  ];
  if (previous && previous.portStrategy !== portStrategy) {
    decisions.push(`Changed port strategy from ${code(previous.portStrategy)} to ${code(portStrategy)}.`);
  }
  if (excluded.length) {
    decisions.push(`Added ${codeList(excluded)} to ${code('.git/info/exclude')}.`);
  }

  await appendLedger(mainRoot, {
    title: `Repository configuration updated: port strategy ${code(portStrategy)}`,
    requirement: opts.reason ?? 'Developer updated repository port strategy configuration.',
    decisions,
    problemSolved: 'New worktrees will follow the updated port allocation rules.',
  });

  return { config: newConfig, previous };
}

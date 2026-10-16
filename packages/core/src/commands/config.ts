import path from 'node:path';
import {
  type ParallelTreeConfig,
  type PortStrategyName,
  CONFIG_FILE,
  DEFAULT_BASE_PORT,
  loadConfig,
  saveConfig,
} from '../config.js';
import { defaultEnvKeys } from '../frameworks/index.js';
import * as git from '../git.js';
import { ensureLines } from '../ignore.js';
import { LEDGER_DIR, appendLedger } from '../ledger.js';
import { type PortStrategyAnswer, type Prompter, silentLogger } from '../prompts.js';
import { code, codeList } from '../util/format.js';
import type { CommonOptions } from './types.js';

export interface EnsureConfigOptions extends CommonOptions {
  /** Asked on first run unless `portStrategy` is given. */
  prompter?: Prompter;
  portStrategy?: PortStrategyName;
  basePort?: number;
  portPool?: string;
}

async function chooseStrategy(opts: EnsureConfigOptions): Promise<PortStrategyAnswer> {
  const basePort = opts.basePort ?? DEFAULT_BASE_PORT;
  if (opts.portStrategy || !opts.prompter) {
    return { portStrategy: opts.portStrategy ?? 'offset', basePort, portPool: opts.portPool };
  }
  return opts.prompter.selectPortStrategy({ basePort });
}

/** Load `.paralleltree.json`, creating it on first run (D-004, D-014, D-020). */
export async function ensureConfig(
  opts: EnsureConfigOptions,
): Promise<{ config: ParallelTreeConfig; created: boolean }> {
  const log = opts.log ?? silentLogger;
  const mainRoot = await git.mainRepoRoot(opts.cwd);
  const existing = await loadConfig(mainRoot);
  if (existing) return { config: existing, created: false };

  const { portStrategy, basePort, portPool } = await chooseStrategy(opts);
  const config: ParallelTreeConfig = { portStrategy, basePort, envKeys: await defaultEnvKeys(mainRoot) };
  if (portPool) config.portPool = portPool;
  await saveConfig(mainRoot, config);
  const ignored = await ensureLines(path.join(mainRoot, '.gitignore'), [`${LEDGER_DIR}/`]);
  log.info(`Saved ${CONFIG_FILE} (portStrategy: ${portStrategy}).`);

  await appendLedger(mainRoot, {
    title: `Repository configured: port strategy ${code(portStrategy)}`,
    requirement: 'First ParallelTree worktree in this repository.',
    decisions: [
      `Port strategy ${code(portStrategy)}, base port ${code(basePort)}, env keys ${codeList(config.envKeys)} saved to ${code(CONFIG_FILE)}.`,
      ...(ignored.length ? [`Added ${code(`${LEDGER_DIR}/`)} to ${code('.gitignore')} (ledger stays local).`] : []),
    ],
    problemSolved: 'Future worktrees reuse this choice without prompting; dev servers get non-colliding ports.',
  });
  return { config, created: true };
}

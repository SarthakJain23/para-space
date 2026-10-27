import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Per-repo config file, at the main repo root and committed (D-014, D-015). */
export const CONFIG_FILE = '.para-space.json';

export const PORT_STRATEGY_NAMES = ['offset', 'scan', 'pool', 'passthrough'] as const;
export type PortStrategyName = (typeof PORT_STRATEGY_NAMES)[number];

/** Contents of `.para-space.json`. `envKeys` are the variables in `.env.local` that receive the port. */
export interface ParaSpaceConfig {
  portStrategy: PortStrategyName;
  basePort: number;
  envKeys: string[];
  /** Ports for the `pool` strategy: an array or a `"3001-3010"` range. */
  portPool?: number[] | string;
}

export const DEFAULT_BASE_PORT = 3000;

/**
 * Resolves the absolute path to `.para-space.json` for a given main repository root.
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @returns Absolute path to `.para-space.json`.
 *
 * @example
 * configPath('/code/app'); // → '/code/app/.para-space.json'
 */
export function configPath(mainRoot: string): string {
  return path.resolve(mainRoot, CONFIG_FILE);
}

/**
 * Checks parsed JSON against the config schema and fills defaults.
 *
 * @param raw - Parsed contents of `.para-space.json`.
 * @returns A complete config (`basePort` defaults to 3000, `envKeys` to `['PORT']`).
 * @throws With a message naming the bad field.
 *
 * @example
 * validateConfig({ portStrategy: 'offset' });
 * // → { portStrategy: 'offset', basePort: 3000, envKeys: ['PORT'] }
 */
export function validateConfig(raw: unknown): ParaSpaceConfig {
  if (!raw || typeof raw !== 'object') throw new Error(`${CONFIG_FILE} must be a JSON object`);
  const c = raw as Record<string, unknown>;
  if (!PORT_STRATEGY_NAMES.includes(c.portStrategy as PortStrategyName)) {
    throw new Error(`${CONFIG_FILE}: portStrategy must be one of ${PORT_STRATEGY_NAMES.join(', ')}`);
  }
  const basePort = c.basePort ?? DEFAULT_BASE_PORT;
  if (!Number.isInteger(basePort) || (basePort as number) < 1 || (basePort as number) > 65535) {
    throw new Error(`${CONFIG_FILE}: basePort must be an integer between 1 and 65535`);
  }
  const envKeys = c.envKeys ?? ['PORT'];
  if (!Array.isArray(envKeys) || !envKeys.every((k) => typeof k === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))) {
    throw new Error(`${CONFIG_FILE}: envKeys must be an array of env variable names`);
  }
  const config: ParaSpaceConfig = {
    portStrategy: c.portStrategy as PortStrategyName,
    basePort: basePort as number,
    envKeys: envKeys as string[],
  };
  if (c.portPool !== undefined) {
    parsePortPool(c.portPool as number[] | string);
    config.portPool = c.portPool as number[] | string;
  }
  if (config.portStrategy === 'pool' && !config.portPool) {
    throw new Error(`${CONFIG_FILE}: portStrategy "pool" requires portPool`);
  }
  return config;
}

/**
 * Expands a `pool` strategy port list into numbers.
 *
 * @param pool - Array of port numbers or a range string like `"3001-3010"`.
 * @returns Expanded array of integer port numbers.
 * @throws If a port is outside 1–65535 or the range string is malformed.
 *
 * @example
 * parsePortPool('3001-3003'); // → [3001, 3002, 3003]
 * parsePortPool([4000, 4005]); // → [4000, 4005]
 */
export function parsePortPool(pool: number[] | string): number[] {
  if (Array.isArray(pool)) {
    if (!pool.every((p) => Number.isInteger(p) && p > 0 && p <= 65535))
      throw new Error('portPool contains an invalid port');
    return pool;
  }
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(pool);
  if (!m) throw new Error(`portPool range must look like "3001-3010", got "${pool}"`);
  const [lo, hi] = [Number(m[1]), Number(m[2])];
  if (lo > hi || hi > 65535) throw new Error(`portPool range "${pool}" is invalid`);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/**
 * Reads and validates `.para-space.json`; returns `undefined` if the repo has none yet.
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @returns Validated `ParaSpaceConfig` or `undefined` if `.para-space.json` does not exist.
 * @throws If the file exists but contains invalid JSON or fails schema validation.
 *
 * @example
 * const cfg = await loadConfig('/code/app');
 */
export async function loadConfig(mainRoot: string): Promise<ParaSpaceConfig | undefined> {
  let text: string;
  try {
    text = await readFile(configPath(mainRoot), 'utf8');
  } catch {
    return undefined;
  }
  return validateConfig(JSON.parse(text));
}

/**
 * Validates and writes `.para-space.json` (pretty-printed with a trailing newline).
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @param config - `ParaSpaceConfig` object to validate and write.
 * @returns Promise that resolves when `.para-space.json` is written.
 *
 * @example
 * await saveConfig('/code/app', { portStrategy: 'offset', basePort: 3000, envKeys: ['PORT'] });
 */
export async function saveConfig(mainRoot: string, config: ParaSpaceConfig): Promise<void> {
  const target = configPath(mainRoot);
  const tmp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmp, JSON.stringify(validateConfig(config), null, 2) + '\n');
  await rename(tmp, target);
}

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CONFIG_FILE = '.paralleltree.json';

export const PORT_STRATEGY_NAMES = ['offset', 'scan', 'pool', 'passthrough'] as const;
export type PortStrategyName = (typeof PORT_STRATEGY_NAMES)[number];

export interface ParallelTreeConfig {
  portStrategy: PortStrategyName;
  basePort: number;
  envKeys: string[];
  /** Ports for the `pool` strategy: an array or a `"3001-3010"` range. */
  portPool?: number[] | string;
}

export const DEFAULT_BASE_PORT = 3000;

export function configPath(mainRoot: string): string {
  return path.resolve(mainRoot, CONFIG_FILE);
}

export function validateConfig(raw: unknown): ParallelTreeConfig {
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
  const config: ParallelTreeConfig = {
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

export async function loadConfig(mainRoot: string): Promise<ParallelTreeConfig | undefined> {
  let text: string;
  try {
    text = await readFile(configPath(mainRoot), 'utf8');
  } catch {
    return undefined;
  }
  return validateConfig(JSON.parse(text));
}

export async function saveConfig(mainRoot: string, config: ParallelTreeConfig): Promise<void> {
  await writeFile(configPath(mainRoot), JSON.stringify(validateConfig(config), null, 2) + '\n');
}

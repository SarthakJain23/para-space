import { envStrategy } from './env.js';
import { nodeStrategy } from './node.js';
import { pythonStrategy } from './python.js';
import type { FrameworkStrategy } from './types.js';

export type { FrameworkStrategy } from './types.js';
export { detectPackageManager } from './node.js';

export const FRAMEWORK_STRATEGIES: FrameworkStrategy[] = [nodeStrategy, pythonStrategy, envStrategy];

export async function detectStrategies(root: string): Promise<FrameworkStrategy[]> {
  const found: FrameworkStrategy[] = [];
  for (const s of FRAMEWORK_STRATEGIES) if (await s.detect(root)) found.push(s);
  return found;
}

/** Every root-relative path any strategy may link (filter by `kind` to narrow). */
export function sharedPaths(kind?: FrameworkStrategy['kind']): string[] {
  return FRAMEWORK_STRATEGIES.filter((s) => !kind || s.kind === kind).flatMap((s) => s.sharedPaths);
}

/** `PORT` plus whatever the detected stacks conventionally read (D-018). */
export async function defaultEnvKeys(root: string): Promise<string[]> {
  const keys = new Set(['PORT']);
  for (const s of await detectStrategies(root)) {
    for (const k of (await s.defaultEnvKeys?.(root)) ?? []) keys.add(k);
  }
  return [...keys];
}

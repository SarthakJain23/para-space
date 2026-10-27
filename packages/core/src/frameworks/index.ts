import { envStrategy } from './env.js';
import { nodeStrategy } from './node.js';
import { pythonStrategy } from './python.js';
import type { FrameworkStrategy } from './types.js';

export type { FrameworkStrategy } from './types.js';
export { detectPackageManager } from './node.js';

/** Every supported stack. To add one, implement `FrameworkStrategy` and append it here (D-005). */
export const FRAMEWORK_STRATEGIES: FrameworkStrategy[] = [nodeStrategy, pythonStrategy, envStrategy];

/**
 * The strategies whose `detect()` matches the project, in `FRAMEWORK_STRATEGIES` order.
 *
 * @param root - Absolute path to the repository root to inspect.
 * @returns Array of matching `FrameworkStrategy` implementations.
 *
 * @example
 * (await detectStrategies('/code/app')).map((s) => s.name); // → ['NodeStrategy', 'EnvStrategy']
 */
export async function detectStrategies(root: string): Promise<FrameworkStrategy[]> {
  const found: FrameworkStrategy[] = [];
  for (const s of FRAMEWORK_STRATEGIES) if (await s.detect(root)) found.push(s);
  return found;
}

/**
 * Every root-relative path any strategy may link (filter by `kind` to narrow).
 *
 * @param kind - Optional strategy kind (`'dependencies'` or `'env'`) to filter by.
 * @returns Array of relative paths managed by matching strategies.
 *
 * @example
 * sharedPaths('dependencies'); // → ['node_modules', '.venv', 'venv']
 */
export function sharedPaths(kind?: FrameworkStrategy['kind']): string[] {
  return FRAMEWORK_STRATEGIES.filter((s) => !kind || s.kind === kind).flatMap((s) => s.sharedPaths);
}

/**
 * Every manifest and lockfile watched across dependency strategies.
 *
 * @returns Unique array of manifest and lockfile filenames.
 *
 * @example
 * manifestFiles(); // → ['package.json', 'pnpm-lock.yaml', ...]
 */
export function manifestFiles(): string[] {
  return [
    ...new Set(FRAMEWORK_STRATEGIES.filter((s) => s.kind === 'dependencies').flatMap((s) => s.manifestFiles ?? [])),
  ];
}

/**
 * `PORT` plus whatever the detected stacks conventionally read (D-018).
 *
 * @param root - Absolute path to the repository root.
 * @returns Array of environment variable names to populate with the allocated port.
 *
 * @example
 * await defaultEnvKeys('/code/app'); // → ['PORT']
 */
export async function defaultEnvKeys(root: string): Promise<string[]> {
  const keys = new Set(['PORT']);
  for (const s of await detectStrategies(root)) {
    for (const k of (await s.defaultEnvKeys?.(root)) ?? []) keys.add(k);
  }
  return [...keys];
}

import type { Logger } from '../prompts.js';

/**
 * Plugin for one ecosystem (Node, Python, env files…): what to share between worktrees,
 * and how to un-share it. Register new strategies in `FRAMEWORK_STRATEGIES` (D-005).
 *
 * @example
 * export const rustStrategy: FrameworkStrategy = {
 *   name: 'RustStrategy',
 *   kind: 'dependencies',
 *   sharedPaths: ['target'],
 *   detect: (root) => exists(path.join(root, 'Cargo.toml')),
 *   linkDependencies: (main, wt, log) => linkDependencyDir(main, wt, 'target', log, 'run cargo build first.'),
 *   isolateDependencies: async (wt) => unlinkIfSymlink(path.join(wt, 'target')),
 * };
 */
export interface FrameworkStrategy {
  /** Shown in output and the ledger, e.g. `NodeStrategy`. */
  name: string;
  /** `dependencies` can be isolated and define the deps mode; `config` is shared as-is. */
  kind: 'dependencies' | 'config';
  /** Root-relative paths this strategy links from the main repo. */
  sharedPaths: string[];
  /** Manifest and lockfile paths watched for dependency divergence (e.g. `package.json`). */
  manifestFiles?: string[];
  detect(projectRoot: string): Promise<boolean>;
  /** Link shared paths into the worktree; returns the absolute link paths created. */
  linkDependencies(mainRoot: string, worktreeRoot: string, log: Logger): Promise<string[]>;
  /** Replace links with an independent copy/install. Returns true if anything changed. */
  isolateDependencies(worktreeRoot: string, mainRoot: string, log: Logger): Promise<boolean>;
  configureIdeSettings?(mainRoot: string, worktreeRoot: string): Promise<Record<string, unknown>>;
  /** Extra env keys this stack usually reads its dev port from. */
  defaultEnvKeys?(projectRoot: string): Promise<string[]>;
}

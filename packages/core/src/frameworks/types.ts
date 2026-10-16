import type { Logger } from '../prompts.js';

export interface FrameworkStrategy {
  name: string;
  /** `dependencies` can be isolated and define the deps mode; `config` is shared as-is. */
  kind: 'dependencies' | 'config';
  /** Root-relative paths this strategy links from the main repo. */
  sharedPaths: string[];
  detect(projectRoot: string): Promise<boolean>;
  /** Link shared paths into the worktree; returns the absolute link paths created. */
  linkDependencies(mainRoot: string, worktreeRoot: string, log: Logger): Promise<string[]>;
  /** Replace links with an independent copy/install. Returns true if anything changed. */
  isolateDependencies(worktreeRoot: string, mainRoot: string, log: Logger): Promise<boolean>;
  configureIdeSettings?(mainRoot: string, worktreeRoot: string): Promise<Record<string, unknown>>;
  /** Extra env keys this stack usually reads its dev port from. */
  defaultEnvKeys?(projectRoot: string): Promise<string[]>;
}

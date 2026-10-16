import type { Logger } from '../prompts.js';

export interface CommonOptions {
  /** Any directory inside the main repo or one of its worktrees. */
  cwd: string;
  log?: Logger;
}

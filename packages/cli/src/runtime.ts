import pc from 'picocolors';
import type { Logger, Prompter } from '@para-space/core';
import { clackPrompter } from './prompter.js';

/** Progress and warnings go to stderr so stdout stays clean for `--json`. */
export const log: Logger = {
  info: (m) => console.error(pc.dim(m)),
  warn: (m) => console.error(pc.yellow(`warning: ${m}`)),
};

/** Prompter only on a real terminal without `--yes`; otherwise core runs non-interactively (D-020). */
export function prompterFor(yes?: boolean): Prompter | undefined {
  return !yes && process.stdin.isTTY && process.stdout.isTTY ? clackPrompter : undefined;
}

/** Wrap a command action: print errors uniformly and set a failing exit code. */
export function action<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(pc.red(`error: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  };
}

export const ok = (message: string) => console.log(`${pc.green('✔')} ${message}`);
export const printJson = (value: unknown) => console.log(JSON.stringify(value, null, 2));

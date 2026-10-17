import type { PortStrategyName } from './config.js';

/** Labels and hints for the port strategies, shared by every front end's picker. */
export const PORT_STRATEGY_CHOICES: ReadonlyArray<{ value: PortStrategyName; label: string; hint: string }> = [
  { value: 'offset', label: 'Offset', hint: 'base + worktree index (3001, 3002, …)' },
  { value: 'scan', label: 'Free port scan', hint: 'lowest open port above base' },
  { value: 'pool', label: 'Static pool', hint: 'from a range you define' },
  { value: 'passthrough', label: 'Passthrough', hint: 'let the framework pick (e.g. Vite)' },
];

export interface PortStrategyAnswer {
  portStrategy: PortStrategyName;
  basePort: number;
  portPool?: string;
}

/**
 * Front-end supplied interaction. The CLI implements it with terminal prompts,
 * the VS Code extension with editor dialogs, tests with stubs. Core never prompts directly (D-020).
 * Omit it entirely to run non-interactively.
 *
 * @example
 * const autoYes: Prompter = {
 *   selectPortStrategy: async ({ basePort }) => ({ portStrategy: 'offset', basePort }),
 *   confirmIdeSettings: async () => true,
 * };
 */
export interface Prompter {
  /** First run only: choose how worktree ports are allocated. */
  selectPortStrategy(defaults: { basePort: number }): Promise<PortStrategyAnswer>;
  /** Ask before touching `.vscode/settings.json` (D-006). */
  confirmIdeSettings(details: { worktreePath: string; color: string; settings: string[] }): Promise<boolean>;
}

/** Progress sink supplied by the front end. Defaults to `silentLogger`. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export const silentLogger: Logger = { info() {}, warn() {} };

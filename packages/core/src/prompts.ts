import type { PortStrategyName } from './config.js';

export interface PortStrategyAnswer {
  portStrategy: PortStrategyName;
  basePort: number;
  portPool?: string;
}

/**
 * Front-end supplied interaction. The CLI implements it with terminal prompts,
 * the VS Code extension with editor dialogs, tests with stubs. Core never prompts directly.
 */
export interface Prompter {
  selectPortStrategy(defaults: { basePort: number }): Promise<PortStrategyAnswer>;
  confirmIdeSettings(details: { worktreePath: string; color: string; settings: string[] }): Promise<boolean>;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export const silentLogger: Logger = { info() {}, warn() {} };

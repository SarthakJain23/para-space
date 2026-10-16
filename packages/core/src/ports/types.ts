import type { PortStrategyName } from '../config.js';

export interface AllocateParams {
  worktreeIndex: number;
  basePort: number;
  /** Ports already assigned to the main repo and other worktrees. */
  assignedPorts: number[];
  /** Only used by the `pool` strategy. */
  pool?: number[];
}

/**
 * How a worktree's dev port is chosen; one per `portStrategy` value (D-004).
 * Runs under the state lock, so it must be quick.
 *
 * @example
 * const offset: PortStrategy = {
 *   name: 'offset',
 *   allocatePort: async ({ basePort, worktreeIndex }) => basePort + worktreeIndex, // 3000 + 1 → 3001
 * };
 */
export interface PortStrategy {
  name: PortStrategyName;
  /** The port for this worktree, or `undefined` to leave ports to the framework (`passthrough`). */
  allocatePort(params: AllocateParams): Promise<number | undefined>;
}

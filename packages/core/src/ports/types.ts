import type { PortStrategyName } from '../config.js';

export interface AllocateParams {
  worktreeIndex: number;
  basePort: number;
  /** Ports already assigned to the main repo and other worktrees. */
  assignedPorts: number[];
  /** Only used by the `pool` strategy. */
  pool?: number[];
}

export interface PortStrategy {
  name: PortStrategyName;
  allocatePort(params: AllocateParams): Promise<number | undefined>;
}

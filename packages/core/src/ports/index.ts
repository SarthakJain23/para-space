import { type ParallelTreeConfig, type PortStrategyName, parsePortPool } from '../config.js';
import type { WorktreeRecord } from '../state.js';
import { offsetStrategy } from './offset.js';
import { passthroughStrategy } from './passthrough.js';
import { poolStrategy } from './pool.js';
import { scanStrategy } from './scan.js';
import type { PortStrategy } from './types.js';

export type { AllocateParams, PortStrategy } from './types.js';

const STRATEGIES: Record<PortStrategyName, PortStrategy> = {
  offset: offsetStrategy,
  scan: scanStrategy,
  pool: poolStrategy,
  passthrough: passthroughStrategy,
};

export function getPortStrategy(name: PortStrategyName): PortStrategy {
  return STRATEGIES[name];
}

/** Port the main repo uses, or undefined when ports are left to the framework. */
export function mainRepoPort(config: ParallelTreeConfig | undefined): number | undefined {
  return config && config.portStrategy !== 'passthrough' ? config.basePort : undefined;
}

/** Allocate a port for worktree `index`, avoiding main's port and every recorded worktree port. */
export function allocateWorktreePort(config: ParallelTreeConfig, records: WorktreeRecord[], index: number) {
  const assignedPorts = [mainRepoPort(config), ...records.map((r) => r.port)].filter(
    (p): p is number => p !== undefined,
  );
  return getPortStrategy(config.portStrategy).allocatePort({
    worktreeIndex: index,
    basePort: config.basePort,
    assignedPorts,
    pool: config.portPool ? parsePortPool(config.portPool) : undefined,
  });
}

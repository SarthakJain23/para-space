import { type ParaSpaceConfig, type PortStrategyName, parsePortPool } from '../config.js';
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

/**
 * Look up a port strategy by its config name.
 *
 * @param name - Strategy identifier (`'offset'`, `'scan'`, `'pool'`, or `'passthrough'`).
 * @returns The matching `PortStrategy` implementation.
 *
 * @example
 * await getPortStrategy('offset').allocatePort({ worktreeIndex: 2, basePort: 3000, assignedPorts: [] }); // → 3002
 */
export function getPortStrategy(name: PortStrategyName): PortStrategy {
  return STRATEGIES[name];
}

/**
 * Port the main repo uses, or undefined when ports are left to the framework.
 *
 * @param config - Optional repository `ParaSpaceConfig`.
 * @returns The base port number, or `undefined` when unconfigured or using `'passthrough'`.
 *
 * @example
 * mainRepoPort({ portStrategy: 'offset', basePort: 3000, envKeys: ['PORT'] }); // → 3000
 */
export function mainRepoPort(config: ParaSpaceConfig | undefined): number | undefined {
  return config && config.portStrategy !== 'passthrough' ? config.basePort : undefined;
}

/**
 * Allocate a port for worktree `index`, avoiding main's port and every recorded worktree port.
 *
 * @param config - Repository `ParaSpaceConfig`.
 * @param records - Existing worktree records for the repository.
 * @param index - Positive worktree index being provisioned.
 * @returns Promise resolving to the allocated port number, or `undefined` for `'passthrough'`.
 *
 * @example
 * const port = await allocateWorktreePort(config, existingRecords, 1);
 */
export function allocateWorktreePort(config: ParaSpaceConfig, records: WorktreeRecord[], index: number) {
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

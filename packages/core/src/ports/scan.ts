import getPort, { portNumbers } from 'get-port';
import type { PortStrategy } from './types.js';

/** Lowest port above the base that is free on this machine and not assigned to another worktree. */
export const scanStrategy: PortStrategy = {
  name: 'scan',
  async allocatePort({ basePort, assignedPorts }) {
    const from = Math.min(basePort + 1, 65535);
    const port = await getPort({
      port: portNumbers(from, Math.min(from + 1000, 65535)),
      exclude: assignedPorts,
    });
    return port;
  },
};

import type { PortStrategy } from './types.js';

/** base + worktree index; skips forward past any port already assigned. */
export const offsetStrategy: PortStrategy = {
  name: 'offset',
  async allocatePort({ worktreeIndex, basePort, assignedPorts }) {
    let port = basePort + worktreeIndex;
    while (assignedPorts.includes(port)) port++;
    if (port > 65535) throw new Error('offset strategy ran past port 65535');
    return port;
  },
};

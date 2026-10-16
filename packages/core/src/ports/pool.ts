import type { PortStrategy } from './types.js';

/** First port from the configured pool that is not assigned yet. */
export const poolStrategy: PortStrategy = {
  name: 'pool',
  async allocatePort({ pool, assignedPorts }) {
    if (!pool?.length) throw new Error('pool strategy requires portPool in .para-space.json');
    const port = pool.find((p) => !assignedPorts.includes(p));
    if (port === undefined) throw new Error(`port pool exhausted (${pool.length} ports all assigned)`);
    return port;
  },
};

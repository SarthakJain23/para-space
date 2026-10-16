import type { PortStrategy } from './types.js';

/** No injection — rely on the framework's own port shifting (e.g. Vite 5173 → 5174). */
export const passthroughStrategy: PortStrategy = {
  name: 'passthrough',
  async allocatePort() {
    return undefined;
  },
};

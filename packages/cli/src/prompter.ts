import * as p from '@clack/prompts';
import { PORT_STRATEGY_CHOICES, type PortStrategyName, type Prompter } from '@para-space/core';

export function bail<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(130);
  }
  return value as T;
}

export const clackPrompter: Prompter = {
  async selectPortStrategy({ basePort }) {
    p.note(
      'No .para-space.json yet — choose how dev-server ports are assigned.\nThis is saved for every future worktree in this repo.',
      'First-time setup',
    );
    const portStrategy = bail(
      await p.select<{ value: PortStrategyName; label: string; hint: string }[], PortStrategyName>({
        message: 'Which port strategy would you like to use for this project?',
        options: PORT_STRATEGY_CHOICES.map((c) => ({ ...c })),
      }),
    );
    if (portStrategy === 'passthrough') return { portStrategy, basePort };
    const base = bail(
      await p.text({
        message: 'Base port (used by the main repo)?',
        initialValue: String(basePort),
        validate: (v) => (/^\d+$/.test(v) && +v > 0 && +v < 65536 ? undefined : 'Enter a port between 1 and 65535'),
      }),
    );
    if (portStrategy !== 'pool') return { portStrategy, basePort: Number(base) };
    const pool = bail(
      await p.text({
        message: 'Port pool range?',
        initialValue: `${Number(base) + 1}-${Number(base) + 20}`,
        validate: (v) => (/^\s*\d+\s*-\s*\d+\s*$/.test(v) ? undefined : 'Use the form 3001-3020'),
      }),
    );
    return { portStrategy, basePort: Number(base), portPool: pool.trim() };
  },

  async confirmIdeSettings({ worktreePath, color, settings }) {
    return bail(
      await p.confirm({
        message: `Write ${settings.length} setting(s) to ${worktreePath}/.vscode/settings.json?\n  Window color: ${color}\n  Keys: ${settings.join(', ')}`,
        initialValue: false,
      }),
    );
  },
};

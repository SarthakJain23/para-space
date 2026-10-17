import { PORT_STRATEGY_CHOICES, type Prompter } from '@para-space/core';
import * as vscode from 'vscode';
import { validatePoolRange, validatePort } from './dialogs.js';
import { ask, pick } from './runtime.js';

const SETUP_TITLE = 'ParaSpace: First-time setup';

/** Core's `Prompter` with editor dialogs, the counterpart of the CLI's `clackPrompter` (D-020). */
export const vscodePrompter: Prompter = {
  async selectPortStrategy({ basePort }) {
    const { value: portStrategy } = await pick(
      PORT_STRATEGY_CHOICES.map((c) => ({ label: c.label, description: c.hint, value: c.value })),
      { title: SETUP_TITLE, placeHolder: 'How should dev-server ports be assigned? Saved to .para-space.json' },
    );
    if (portStrategy === 'passthrough') return { portStrategy, basePort };

    const base = Number(
      await ask({
        title: SETUP_TITLE,
        prompt: 'Base port (used by the main repo)',
        value: String(basePort),
        validateInput: validatePort,
      }),
    );
    if (portStrategy !== 'pool') return { portStrategy, basePort: base };

    const pool = await ask({
      title: SETUP_TITLE,
      prompt: 'Port pool range',
      value: `${base + 1}-${base + 20}`,
      validateInput: validatePoolRange,
    });
    return { portStrategy, basePort: base, portPool: pool.trim() };
  },

  // Dismissing the dialog means "no" rather than cancel: by now the worktree exists (D-006).
  async confirmIdeSettings({ worktreePath, color, settings }) {
    const write = 'Write Settings';
    const answer = await vscode.window.showInformationMessage(
      `Color this worktree's window ${color}?`,
      {
        modal: true,
        detail: `Writes ${settings.length} setting(s) to ${worktreePath}/.vscode/settings.json:\n${settings.join(', ')}`,
      },
      write,
    );
    return answer === write;
  },
};

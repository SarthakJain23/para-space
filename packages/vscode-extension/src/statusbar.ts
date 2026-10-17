import * as vscode from 'vscode';
import { statusBarText, worktreeTooltip } from './items.js';
import type { WorktreeStore } from './store.js';

const SWITCH_COMMAND = 'paraSpace.listWorktrees';

/**
 * Bottom-left indicator for the worktree this window has open: a dot in its ParaSpace color
 * (when it has one) and `branch · :port`. Clicking either opens the worktree switcher.
 * Hidden when the folder is not a git repo.
 */
export function createStatusBar(store: WorktreeStore): vscode.Disposable {
  // Higher priority sits further left, so the dot comes first.
  const dot = vscode.window.createStatusBarItem('paraSpace.color', vscode.StatusBarAlignment.Left, 101);
  const label = vscode.window.createStatusBarItem('paraSpace.current', vscode.StatusBarAlignment.Left, 100);
  dot.name = 'ParaSpace Worktree Color';
  label.name = 'ParaSpace Worktree';
  dot.text = '$(circle-filled)';
  dot.command = label.command = SWITCH_COMMAND;

  const update = () => {
    const current = store.current;
    if (!current) {
      dot.hide();
      label.hide();
      return;
    }
    const tooltip = `${worktreeTooltip(current)}\n\nClick to switch worktree`;
    label.text = statusBarText(current);
    label.tooltip = tooltip;
    label.show();
    if (current.color) {
      dot.color = current.color;
      dot.tooltip = tooltip;
      dot.show();
    } else {
      dot.hide();
    }
  };

  update();
  return vscode.Disposable.from(dot, label, store.onDidChange(update));
}

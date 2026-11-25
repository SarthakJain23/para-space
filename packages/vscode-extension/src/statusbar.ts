import * as vscode from 'vscode';
import { statusBarText } from './items.js';
import { buildStatusBarStatsMarkdown } from './statsItems.js';
import type { StatsTreeProvider } from './statsTree.js';
import type { WorktreeStore } from './store.js';

const SWITCH_COMMAND = 'paraSpace.listWorktrees';

/**
 * Bottom-left indicator for the worktree this window has open: a dot in its ParaSpace color
 * (when it has one) and `branch · :port`. Hover shows live ParaSpace stats and quick links;
 * clicking opens the worktree switcher. Hidden when the folder is not a git repo.
 */
export function createStatusBar(store: WorktreeStore, statsTree?: StatsTreeProvider): vscode.Disposable {
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
    const tooltip = new vscode.MarkdownString(buildStatusBarStatsMarkdown(current, statsTree?.latestStats));
    tooltip.isTrusted = true;
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
  const disposables: vscode.Disposable[] = [
    dot,
    label,
    store.onDidChange(update),
    vscode.window.onDidChangeActiveTextEditor(update),
  ];
  if (statsTree) disposables.push(statsTree.onDidChangeStats(update));
  return vscode.Disposable.from(...disposables);
}

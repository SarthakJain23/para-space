import { type DailyActivityBucket, type ParaSpaceStats, formatBytes, formatDuration } from '@para-space/core';
import { computeStorageSegments } from './statsItems.js';

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderActivitySvg(series: DailyActivityBucket[]): string {
  const recent = series.slice(-21);
  if (recent.length === 0) {
    return '<div class="empty">No historical activity recorded yet. Create or manage worktrees to populate this chart.</div>';
  }
  const maxVal = Math.max(1, ...recent.map((b) => b.created + b.isolated + b.removed));
  const width = 620;
  const height = 140;
  const barGap = 4;
  const barW = Math.max(8, Math.floor((width - barGap * recent.length) / recent.length));

  const bars = recent
    .map((b, i) => {
      const x = i * (barW + barGap);
      const createdH = Math.round((b.created / maxVal) * (height - 24));
      const isoH = Math.round((b.isolated / maxVal) * (height - 24));
      const remH = Math.round((b.removed / maxVal) * (height - 24));
      const yCreated = height - 20 - createdH;
      const yIso = yCreated - isoH;
      const yRem = yIso - remH;
      const tip = `${b.date}: ${b.created} created, ${b.isolated} isolated, ${b.removed} removed (${formatBytes(b.diskSavedBytes)} saved)`;
      return `<g><title>${esc(tip)}</title>
        ${createdH > 0 ? `<rect x="${x}" y="${yCreated}" width="${barW}" height="${createdH}" rx="2" fill="var(--vscode-charts-green, #3fb950)" />` : ''}
        ${isoH > 0 ? `<rect x="${x}" y="${yIso}" width="${barW}" height="${isoH}" rx="2" fill="var(--vscode-charts-orange, #d29922)" />` : ''}
        ${remH > 0 ? `<rect x="${x}" y="${yRem}" width="${barW}" height="${remH}" rx="2" fill="var(--vscode-charts-red, #f85149)" />` : ''}
      </g>`;
    })
    .join('');

  const firstDate = esc(recent[0].date);
  const lastDate = esc(recent[recent.length - 1].date);
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily ParaSpace activity">
    ${bars}
    <text x="0" y="${height - 4}" class="axis">${firstDate}</text>
    <text x="${width}" y="${height - 4}" text-anchor="end" class="axis">${lastDate}</text>
  </svg>`;
}

function renderWorktreeRows(stats: ParaSpaceStats): string {
  const rows: string[] = [];
  for (const repo of stats.repos) {
    if (repo.missing) {
      rows.push(`<tr class="muted">
        <td>${esc(repo.name)} <span class="badge warn">missing</span></td>
        <td colspan="6">Previously tracked (${repo.lifetime.createdCount} created · ${esc(formatBytes(repo.lifetime.cumulativeDiskSavedBytes))} lifetime saved)</td>
      </tr>`);
      continue;
    }
    for (const wt of repo.worktrees) {
      const dot = wt.color
        ? `<span class="dot" style="background:${esc(wt.color)}"></span>`
        : '<span class="dot neutral"></span>';
      const status =
        wt.dirty > 0 ? `<span class="badge warn">${wt.dirty} dirty</span>` : '<span class="badge ok">Clean</span>';
      const mode = wt.diverged
        ? `<span class="badge warn">${esc(wt.depsMode)} · diverged</span>`
        : `<span class="badge">${esc(wt.depsMode)}</span>`;
      const disk = stats.diskMeasured ? esc(formatBytes(wt.diskUsageBytes)) : '…';
      const saved = wt.isMain ? '—' : stats.diskMeasured ? esc(formatBytes(wt.diskSavedBytes)) : '…';
      const actions = [
        `<button class="mini" data-action="open" data-path="${esc(wt.path)}">Open</button>`,
        !wt.isMain && wt.depsMode === 'Symlinked'
          ? `<button class="mini" data-action="isolate" data-path="${esc(wt.path)}" data-root="${esc(repo.mainRoot)}">Isolate</button>`
          : '',
      ].join(' ');
      rows.push(`<tr>
        <td>${esc(repo.name)}</td>
        <td>${dot}${esc(wt.branch ?? wt.name)}</td>
        <td>${mode}</td>
        <td>${wt.port !== undefined ? `:${wt.port}` : '—'}</td>
        <td>${disk}</td>
        <td class="good">${saved}</td>
        <td>${status} ${actions}</td>
      </tr>`);
    }
  }
  if (rows.length === 0) {
    return '<tr><td colspan="7" class="empty">No repositories found in this scope.</td></tr>';
  }
  return rows.join('\n');
}

/**
 * Generates the self-contained HTML for the ParaSpace Stats Webview Dashboard.
 * Uses strict nonce CSP, native VS Code theme CSS variables, and zero external dependencies.
 */
export function renderStatsDashboardHtml(stats: ParaSpaceStats, nonce: string): string {
  const { summary, lifetime, diskMeasured } = stats;
  const seg = computeStorageSegments(stats);
  const liveDiskSaved = diskMeasured ? formatBytes(summary.liveDiskSavedBytes) : 'Measuring…';
  const totalDisk = diskMeasured ? formatBytes(summary.totalDiskUsageBytes) : 'Measuring…';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${esc(nonce)}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ParaSpace Stats</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 20px 24px; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  h1 { font-size: 20px; margin: 0; font-weight: 600; }
  .sub { font-size: 12px; opacity: 0.75; margin-top: 2px; }
  .controls { display: flex; gap: 8px; align-items: center; }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 5px 10px; cursor: pointer; font-size: 12px; }
  button.active, button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  button.mini { padding: 2px 7px; font-size: 11px; margin-left: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 14px; }
  .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75; }
  .kpi-val { font-size: 22px; font-weight: 700; margin: 6px 0 4px; }
  .kpi-sub { font-size: 12px; opacity: 0.8; }
  .section { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 14px 16px; margin-bottom: 16px; }
  .section h2 { font-size: 13px; margin: 0 0 10px; font-weight: 600; }
  .bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--vscode-editorWidget-border); margin-bottom: 8px; }
  .seg-saved { background: var(--vscode-charts-green, #3fb950); }
  .seg-work { background: var(--vscode-charts-blue, #3794ff); }
  .seg-iso { background: var(--vscode-charts-orange, #d29922); }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; opacity: 0.85; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
  .chart { width: 100%; max-height: 150px; display: block; }
  .axis { fill: var(--vscode-descriptionForeground); font-size: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  th { font-size: 11px; text-transform: uppercase; opacity: 0.75; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .dot.neutral { background: var(--vscode-descriptionForeground); opacity: 0.5; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 11px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .badge.ok { background: rgba(63, 185, 80, 0.2); color: var(--vscode-charts-green, #3fb950); }
  .badge.warn { background: rgba(210, 153, 34, 0.2); color: var(--vscode-charts-orange, #d29922); }
  .good { color: var(--vscode-charts-green, #3fb950); font-weight: 600; }
  .muted { opacity: 0.7; }
  .empty { opacity: 0.7; padding: 12px 0; font-size: 12px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>ParaSpace Stats</h1>
      <div class="sub">${stats.scope === 'global' ? 'All Tracked Repositories' : 'Current Workspace'} · Updated ${esc(new Date(stats.generatedAt).toLocaleTimeString())}</div>
    </div>
    <div class="controls">
      <button class="${stats.scope === 'repo' ? 'active' : ''}" data-scope="repo">Current Workspace</button>
      <button class="${stats.scope === 'global' ? 'active' : ''}" data-scope="global">All Repos</button>
      <button class="primary" data-refresh="1">Refresh</button>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="kpi-label">Disk Saved (Live)</div>
      <div class="kpi-val good">${esc(liveDiskSaved)}</div>
      <div class="kpi-sub">Lifetime: ${esc(formatBytes(lifetime.cumulativeDiskSavedBytes))}</div>
    </div>
    <div class="card">
      <div class="kpi-label">Est. Time Saved</div>
      <div class="kpi-val good">~${esc(formatDuration(summary.liveTimeSavedMs))}</div>
      <div class="kpi-sub">Lifetime: ~${esc(formatDuration(lifetime.cumulativeTimeSavedMs))}</div>
    </div>
    <div class="card">
      <div class="kpi-label">Active Worktrees</div>
      <div class="kpi-val">${summary.activeWorktrees}</div>
      <div class="kpi-sub">${summary.symlinkedCount} shared · ${summary.isolatedCount} isolated · ${summary.portsAllocated} ports</div>
    </div>
    <div class="card">
      <div class="kpi-label">Lifetime Activity</div>
      <div class="kpi-val">${lifetime.createdCount} created</div>
      <div class="kpi-sub">${lifetime.isolatedCount} isolated · ${lifetime.removedCount} removed · Peak ${lifetime.peakConcurrentWorktrees}</div>
    </div>
  </div>

  <div class="section">
    <h2>Storage Breakdown (${esc(totalDisk)} on disk)</h2>
    <div class="bar">
      <div class="seg-saved" style="width:${seg.savedPct}%" title="Saved via symlinks & shared git"></div>
      <div class="seg-work" style="width:${seg.workingTreePct}%" title="Working trees & main repos"></div>
      <div class="seg-iso" style="width:${seg.isolatedDepsPct}%" title="Isolated dependencies"></div>
    </div>
    <div class="legend">
      <span><span class="swatch seg-saved"></span>Saved: ${esc(formatBytes(seg.savedBytes))} (${seg.savedPct}%)</span>
      <span><span class="swatch seg-work"></span>Working Trees: ${esc(formatBytes(seg.workingTreeBytes))} (${seg.workingTreePct}%)</span>
      <span><span class="swatch seg-iso"></span>Isolated Deps: ${esc(formatBytes(seg.isolatedDepsBytes))} (${seg.isolatedDepsPct}%)</span>
    </div>
  </div>

  <div class="section">
    <h2>Activity Over Time (Recent Days)</h2>
    ${renderActivitySvg(stats.activitySeries)}
    <div class="legend" style="margin-top:8px">
      <span><span class="swatch seg-saved"></span>Created</span>
      <span><span class="swatch seg-iso"></span>Isolated</span>
      <span><span class="swatch" style="background:var(--vscode-charts-red, #f85149)"></span>Removed</span>
    </div>
  </div>

  <div class="section">
    <h2>Repositories & Worktrees (${summary.activeRepos} repos · ${summary.totalWorkspaces} workspaces)</h2>
    <table>
      <thead>
        <tr><th>Repo</th><th>Branch / Worktree</th><th>Deps Mode</th><th>Port</th><th>Disk Usage</th><th>Disk Saved</th><th>Status & Actions</th></tr>
      </thead>
      <tbody>${renderWorktreeRows(stats)}</tbody>
    </table>
  </div>

  <script nonce="${esc(nonce)}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.scope) vscode.postMessage({ type: 'setScope', scope: btn.dataset.scope });
      else if (btn.dataset.refresh) vscode.postMessage({ type: 'refresh' });
      else if (btn.dataset.action === 'open') vscode.postMessage({ type: 'openWorktree', path: btn.dataset.path });
      else if (btn.dataset.action === 'isolate') vscode.postMessage({ type: 'isolateWorktree', path: btn.dataset.path, repoRoot: btn.dataset.root });
    });
  </script>
</body>
</html>`;
}

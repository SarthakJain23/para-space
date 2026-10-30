import fs from 'node:fs/promises';
import path from 'node:path';
import { colorForHex, peacockSettings } from '../colors.js';
import { currentBranch, mainRepoRoot } from '../git.js';
import { exists } from '../util/fs.js';
import type { WorkspaceRecord, WorkspaceRepoEntry } from '../workspaceState.js';
import { findWorkspaceConfigFile, readWorkspaceConfigFile } from './config.js';

/**
 * Inspects a .code-workspace file and attempts to construct a WorkspaceRecord if it contains git repositories or worktrees.
 *
 * @param filePath - Path to the .code-workspace file.
 * @param knownWorktreeColors - Optional map of worktreePath -> hexColor to preserve/inject window colors.
 * @returns WorkspaceRecord or undefined if not a valid multi-repo workspace.
 *
 * @example
 * const record = await parseWorkspaceFileAsRecord('/code/my-app.code-workspace');
 */
export async function parseWorkspaceFileAsRecord(
  filePath: string,
  knownWorktreeColors?: Record<string, string>,
): Promise<WorkspaceRecord | undefined> {
  const absPath = path.resolve(filePath);
  const config = await readWorkspaceConfigFile(absPath);
  if (!config?.folders || !Array.isArray(config.folders) || config.folders.length === 0) {
    return undefined;
  }

  const dir = path.dirname(absPath);
  const repoEntries: WorkspaceRepoEntry[] = [];
  const branches: string[] = [];

  for (const folder of config.folders) {
    if (!folder.path) continue;
    const targetPath = path.isAbsolute(folder.path) ? folder.path : path.resolve(dir, folder.path);
    if (!(await exists(targetPath))) continue;

    try {
      const root = await mainRepoRoot(targetPath);
      const branch = await currentBranch(targetPath);
      if (branch) branches.push(branch);
      repoEntries.push({
        root,
        name: folder.name || path.basename(root),
        worktreePath: targetPath,
      });
    } catch {
      // not a git repo/worktree
    }
  }

  if (repoEntries.length === 0) return undefined;

  const uniqueBranches = Array.from(new Set(branches));
  const branchName =
    uniqueBranches.length === 1
      ? uniqueBranches[0]
      : path.basename(absPath, '.code-workspace').replace(/^Untitled-/, '');

  const existingColors = config.settings?.['workbench.colorCustomizations'] as Record<string, string> | undefined;
  let color = existingColors?.['titleBar.activeBackground'];

  if (!color && knownWorktreeColors) {
    for (const entry of repoEntries) {
      const matchColor = knownWorktreeColors[path.resolve(entry.worktreePath)];
      if (matchColor) {
        color = matchColor;
        break;
      }
    }
  }

  if (color && !existingColors?.['titleBar.activeBackground']) {
    const colorProfile = colorForHex(color);
    config.settings = {
      ...(config.settings ?? {}),
      'workbench.colorCustomizations': {
        ...(existingColors ?? {}),
        ...peacockSettings(colorProfile),
      },
    };
    await fs.writeFile(absPath, JSON.stringify(config, null, 2), 'utf8').catch(() => {});
  }

  let createdAt = new Date().toISOString();
  try {
    const stat = await fs.stat(absPath);
    createdAt = stat.birthtime?.toISOString() || stat.mtime?.toISOString() || createdAt;
  } catch {
    // ignore
  }

  return {
    id: absPath,
    name: path.basename(absPath, '.code-workspace'),
    workspaceFile: absPath,
    branch: branchName,
    color,
    repos: repoEntries,
    createdAt,
  };
}

/**
 * Discovers Git repository roots in a workspace directory: inspecting cwd,
 * any .code-workspace file folders, and immediate child directories.
 *
 * @param cwd - The base working directory to inspect.
 * @returns Unique absolute repository root paths found.
 *
 * @example
 * const roots = await discoverWorkspaceRepoRoots('/code/multi-repo');
 */
export async function discoverWorkspaceRepoRoots(cwd: string): Promise<string[]> {
  const roots = new Set<string>();

  try {
    const root = await mainRepoRoot(cwd);
    roots.add(root);
  } catch {
    // not inside a git repo
  }

  const wsFile = await findWorkspaceConfigFile(cwd);
  if (wsFile) {
    const wsDir = path.dirname(wsFile);
    const config = await readWorkspaceConfigFile(wsFile);
    if (config?.folders && Array.isArray(config.folders)) {
      for (const folder of config.folders) {
        if (!folder.path) continue;
        const targetPath = path.isAbsolute(folder.path) ? folder.path : path.resolve(wsDir, folder.path);
        try {
          const root = await mainRepoRoot(targetPath);
          roots.add(root);
        } catch {
          // not a git repo
        }
      }
    }
  }

  try {
    const entries = await fs.readdir(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const subPath = path.join(cwd, entry.name);
        try {
          const root = await mainRepoRoot(subPath);
          roots.add(root);
        } catch {
          // not a git repo
        }
      }
    }
  } catch {
    // ignore readdir error
  }

  return Array.from(roots);
}

/**
 * Discovers candidate Git repository roots that can be added to an existing multi-repo workspace,
 * scanning sibling directories of member repositories, `cwd`, and recorded repositories in state,
 * while excluding repositories already present in `workspace`.
 *
 * @param workspace - Existing multi-repository workspace record.
 * @param cwd - Optional working directory context.
 * @returns Array of absolute repository root paths not yet in `workspace`.
 *
 * @example
 * const available = await discoverCandidateReposForWorkspace(workspace, process.cwd());
 */
export async function discoverCandidateReposForWorkspace(workspace: WorkspaceRecord, cwd?: string): Promise<string[]> {
  const existingRoots = new Set(workspace.repos.map((r) => path.resolve(r.root)));
  const searchDirs = new Set<string>();

  for (const repo of workspace.repos) {
    searchDirs.add(path.dirname(path.resolve(repo.root)));
  }

  if (cwd) {
    const absCwd = path.resolve(cwd);
    searchDirs.add(absCwd);
    try {
      const cwdRoot = await mainRepoRoot(absCwd);
      searchDirs.add(path.dirname(cwdRoot));
    } catch {
      searchDirs.add(path.dirname(absCwd));
    }
  }

  const candidates = new Set<string>();
  for (const dir of searchDirs) {
    const discovered = await discoverWorkspaceRepoRoots(dir);
    for (const root of discovered) {
      const resolved = path.resolve(root);
      if (!existingRoots.has(resolved)) {
        candidates.add(resolved);
      }
    }
  }

  return Array.from(candidates);
}

/**
 * Resolves a repository path or name (e.g. `mobile`, `../mobile`, `/code/mobile`) against
 * `baseDir`, sibling directories of `workspace` member repos, and discovered candidate repositories.
 *
 * @param input - Repository path or folder name.
 * @param baseDir - Working directory to resolve relative paths against first.
 * @param workspace - Optional workspace whose member sibling directories should be searched.
 * @returns Resolved main repository root path.
 *
 * @example
 * const root = await resolveRepoInput('mobile', '/code/frontend', workspace);
 */
export async function resolveRepoInput(input: string, baseDir: string, workspace?: WorkspaceRecord): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Repository path or name cannot be empty.');
  }

  const candidatePaths: string[] = [path.resolve(baseDir, trimmed)];
  if (workspace) {
    for (const repo of workspace.repos) {
      candidatePaths.push(path.resolve(path.dirname(path.resolve(repo.root)), trimmed));
    }
  }
  try {
    const cwdRoot = await mainRepoRoot(baseDir);
    candidatePaths.push(path.resolve(path.dirname(cwdRoot), trimmed));
  } catch {
    candidatePaths.push(path.resolve(path.dirname(path.resolve(baseDir)), trimmed));
  }

  for (const candidate of candidatePaths) {
    if (await exists(candidate)) {
      try {
        return await mainRepoRoot(candidate);
      } catch {
        // try next candidate
      }
    }
  }

  const lower = trimmed.toLowerCase();
  if (workspace) {
    const existingMatch = workspace.repos.find(
      (r) => r.name.toLowerCase() === lower || path.basename(r.root).toLowerCase() === lower,
    );
    if (existingMatch) return path.resolve(existingMatch.root);

    const candidates = await discoverCandidateReposForWorkspace(workspace, baseDir);
    const nameMatch = candidates.find((root) => path.basename(root).toLowerCase() === lower);
    if (nameMatch) return nameMatch;
  }

  const discoveredInBase = await discoverWorkspaceRepoRoots(baseDir);
  const baseMatch = discoveredInBase.find((root) => path.basename(root).toLowerCase() === lower);
  if (baseMatch) return baseMatch;

  throw new Error(`Repository not found: "${input}". Provide a valid Git repository path or sibling repo name.`);
}

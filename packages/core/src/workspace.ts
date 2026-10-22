import fs from 'node:fs/promises';
import path from 'node:path';
import { type ColorProfile, colorForHex, peacockSettings } from './colors.js';
import { currentBranch, mainRepoRoot } from './git.js';
import { slugify } from './paths.js';
import type { WorkspaceRecord, WorkspaceRepoEntry } from './state.js';
import { exists } from './util/fs.js';

/** Folder entry in a VS Code .code-workspace file. */
export interface CodeWorkspaceFolder {
  name?: string;
  path: string;
}

/** Configuration content of a VS Code .code-workspace file. */
export interface CodeWorkspaceConfig {
  folders: CodeWorkspaceFolder[];
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Returns branch names available in every given repository branch list, preserving the first repo's ordering.
 *
 * @param branchLists - Array of branch lists, one per repository.
 * @returns Array of branch names present in all lists.
 *
 * @example
 * sharedBranches([['main', 'feat/login'], ['feat/login', 'main', 'feat/other']]); // → ['main', 'feat/login']
 */
export function sharedBranches(branchLists: string[][]): string[] {
  if (branchLists.length === 0) return [];
  if (branchLists.length === 1) return Array.from(new Set(branchLists[0]));
  const common = new Set(branchLists.slice(1).flat());
  return Array.from(new Set(branchLists[0])).filter(
    (branch) => common.has(branch) && branchLists.slice(1).every((branches) => branches.includes(branch)),
  );
}

/**
 * Generates or updates a .code-workspace JSON object for the selected worktrees,
 * preserving workspace settings but keeping only the specified worktree folders.
 * Optionally applies Peacock colorCustomizations for the workspace window.
 *
 * @param newWorktrees - Array of { mainRoot, worktreePath } for each worktree.
 * @param existingConfig - Optional existing .code-workspace config to preserve settings from.
 * @param colorProfile - Optional ColorProfile to apply to the workspace window frame.
 * @returns Updated CodeWorkspaceConfig object.
 *
 * @example
 * const cfg = buildMultiRepoWorkspaceConfig([{ mainRoot: '/code/app', worktreePath: '/code/app-feat-x' }]);
 * // cfg.folders === [{ name: 'app', path: '/code/app-feat-x' }]
 */
export function buildMultiRepoWorkspaceConfig(
  newWorktrees: { mainRoot: string; worktreePath: string }[],
  existingConfig?: CodeWorkspaceConfig,
  colorProfile?: ColorProfile,
): CodeWorkspaceConfig {
  const config: CodeWorkspaceConfig = existingConfig ? JSON.parse(JSON.stringify(existingConfig)) : { folders: [] };
  config.folders = newWorktrees.map((w) => ({
    name: path.basename(w.mainRoot),
    path: path.resolve(w.worktreePath),
  }));
  if (colorProfile) {
    const existingSettings = config.settings ?? {};
    const existingColors = (existingSettings['workbench.colorCustomizations'] as Record<string, string>) ?? {};
    config.settings = {
      ...existingSettings,
      'workbench.colorCustomizations': {
        ...existingColors,
        ...peacockSettings(colorProfile),
      },
    };
  }
  return config;
}

/**
 * Computes the file path for the .code-workspace file when creating a multi-repo workspace.
 *
 * @param worktreePaths - Array of absolute worktree directory paths.
 * @param branch - The branch name or label for the workspace.
 * @param existingWorkspaceFilePath - Optional path to the existing .code-workspace file.
 * @param workspaceName - Optional base name for the workspace.
 * @returns Absolute file path to the .code-workspace file.
 *
 * @example
 * multiRepoWorkspaceFilePath(['/code/app-feat-x'], 'feat/x', undefined, 'my-project');
 * // → '/code/my-project-feat-x.code-workspace'
 */
export function multiRepoWorkspaceFilePath(
  worktreePaths: string[],
  branch: string,
  existingWorkspaceFilePath?: string,
  workspaceName?: string,
): string {
  const branchSlug = slugify(branch);
  if (existingWorkspaceFilePath) {
    const dir = path.dirname(existingWorkspaceFilePath);
    const base = path.basename(existingWorkspaceFilePath, '.code-workspace');
    return path.join(dir, `${base}-${branchSlug}.code-workspace`);
  }
  const parentDir = path.dirname(worktreePaths[0]);
  const rawName = workspaceName || 'workspace';
  const cleanName = rawName.replace(/\s*\(Workspace\)$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return path.join(parentDir, `${cleanName}-${branchSlug}.code-workspace`);
}

/**
 * Finds the first .code-workspace file in the given directory, if any exists.
 *
 * @param cwd - Directory to search in.
 * @returns Absolute path to the .code-workspace file, or undefined.
 *
 * @example
 * const file = await findWorkspaceConfigFile('/code/my-project');
 */
export async function findWorkspaceConfigFile(cwd: string): Promise<string | undefined> {
  try {
    const entries = await fs.readdir(cwd);
    const match = entries.find((e) => e.endsWith('.code-workspace'));
    return match ? path.resolve(cwd, match) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads and parses a .code-workspace JSON file if it exists and is valid.
 *
 * @param filePath - Path to the .code-workspace file.
 * @returns Parsed CodeWorkspaceConfig or undefined if not readable/parsable.
 *
 * @example
 * const config = await readWorkspaceConfigFile('/code/app.code-workspace');
 */
export async function readWorkspaceConfigFile(filePath: string): Promise<CodeWorkspaceConfig | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as CodeWorkspaceConfig;
  } catch {
    return undefined;
  }
}

/**
 * Finds all .code-workspace files in the given directory.
 *
 * @param dir - Directory to search in.
 * @returns Array of absolute paths to .code-workspace files found.
 *
 * @example
 * const files = await findAllWorkspaceConfigFiles('/code/my-project');
 */
export async function findAllWorkspaceConfigFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.endsWith('.code-workspace')).map((e) => path.resolve(dir, e));
  } catch {
    return [];
  }
}

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

  // Determine branch name
  const uniqueBranches = Array.from(new Set(branches));
  const branchName =
    uniqueBranches.length === 1
      ? uniqueBranches[0]
      : path.basename(absPath, '.code-workspace').replace(/^Untitled-/, '');

  // Extract color from settings if present, or from known worktrees
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

  // If a color is identified but not yet in the .code-workspace file, inject it
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

  // 1. Check if cwd itself is inside a git repo
  try {
    const root = await mainRepoRoot(cwd);
    roots.add(root);
  } catch {
    // not inside a git repo
  }

  // 2. Check for a .code-workspace file in cwd
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

  // 3. Check immediate subdirectories of cwd
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

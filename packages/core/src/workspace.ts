import fs from 'node:fs/promises';
import path from 'node:path';
import { type ColorProfile, peacockSettings } from './colors.js';
import { mainRepoRoot } from './git.js';
import { slugify } from './paths.js';

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

import fs from 'node:fs/promises';
import path from 'node:path';
import { type ColorProfile, peacockSettings } from '../colors.js';
import { parseJsonc } from '../ide.js';
import { slugify, workspacesDir } from '../paths.js';

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
 * // → '/Users/you/.para-space/workspaces/my-project-feat-x.code-workspace'
 */
export function multiRepoWorkspaceFilePath(
  worktreePaths: string[],
  branch: string,
  existingWorkspaceFilePath?: string,
  workspaceName?: string,
): string {
  const branchSlug = slugify(branch);
  if (existingWorkspaceFilePath) {
    const resolvedExisting = path.resolve(existingWorkspaceFilePath);
    const base = path.basename(existingWorkspaceFilePath, '.code-workspace');
    if (path.dirname(resolvedExisting) === path.resolve(workspacesDir()) && base.endsWith(`-${branchSlug}`)) {
      return resolvedExisting;
    }
    return path.join(workspacesDir(), `${base}-${branchSlug}.code-workspace`);
  }
  const projectDir = worktreePaths[0] ? path.basename(path.dirname(worktreePaths[0])) : undefined;
  const rawName = workspaceName || projectDir || 'workspace';
  const cleanName = rawName.replace(/\s*\(Workspace\)$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return path.join(workspacesDir(), `${cleanName}-${branchSlug}.code-workspace`);
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
    return parseJsonc(content) as CodeWorkspaceConfig;
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

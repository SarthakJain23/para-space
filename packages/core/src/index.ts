export * from './commands/index.js';
export * from './config.js';
export * from './prompts.js';
export { colorForIndex, colorForHex, peacockSettings, PALETTE, type ColorProfile } from './colors.js';
export { ledgerPath, appendLedger, parseLedger, readLedger, type LedgerEntry } from './ledger.js';
export { paraSpaceHome, slugify, worktreePathFor, worktreesDir, workspacesDir } from './paths.js';
export { getPortStrategy, type PortStrategy, type AllocateParams } from './ports/index.js';
export { FRAMEWORK_STRATEGIES, detectStrategies, manifestFiles, type FrameworkStrategy } from './frameworks/index.js';
export { checkDivergence, checkAllDivergence, type DivergenceResult } from './divergence.js';
export { mainRepoRoot, branchExists, currentBranch, syncBaseBranch, validateBranchName } from './git.js';
export {
  statePath,
  type DepsMode,
  type WorktreeRecord,
  type RepoState,
  type StateFile,
  stateDir,
  readState,
  writeState,
  stateLockPath,
  updateRepoState,
  getRepoState,
  nextWorktreeIndex,
  updateWorkspaceState,
} from './state.js';
export {
  type WorkspaceRecord,
  type WorkspaceRepoEntry,
  saveWorkspaceRecord,
  getWorkspaceRecords,
  findWorkspaceForWorktree,
  removeWorkspaceRecord,
} from './workspaceState.js';
export {
  sharedBranches,
  buildMultiRepoWorkspaceConfig,
  multiRepoWorkspaceFilePath,
  findWorkspaceConfigFile,
  findAllWorkspaceConfigFiles,
  readWorkspaceConfigFile,
  parseWorkspaceFileAsRecord,
  discoverWorkspaceRepoRoots,
  discoverCandidateReposForWorkspace,
  resolveRepoInput,
  provisionWorkspaceBatch,
  writeAndSaveWorkspace,
  addReposToWorkspace,
  matchesQuery,
  filterWorkspaces,
  filterWorktreeRows,
  findMatchingWorkspace,
  removeWorkspaceCascade,
  type CodeWorkspaceFolder,
  type CodeWorkspaceConfig,
  type WorkspaceBranchPlan,
  type ProvisionBatchOptions,
  type WriteWorkspaceOptions,
  type WriteWorkspaceResult,
  type AddReposToWorkspaceOptions,
  type AddReposToWorkspaceResult,
  type RemoveWorkspaceCascadeOptions,
  type RemoveWorkspaceCascadeResult,
} from './workspace.js';
export { exists } from './util/fs.js';

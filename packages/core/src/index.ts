export * from './commands/index.js';
export * from './config.js';
export * from './prompts.js';
export { colorForIndex, colorForHex, peacockSettings, PALETTE, type ColorProfile } from './colors.js';
export { ledgerPath, appendLedger, parseLedger, readLedger, type LedgerEntry } from './ledger.js';
export { slugify, worktreePathFor } from './paths.js';
export { getPortStrategy, type PortStrategy, type AllocateParams } from './ports/index.js';
export { FRAMEWORK_STRATEGIES, detectStrategies, manifestFiles, type FrameworkStrategy } from './frameworks/index.js';
export { checkDivergence, checkAllDivergence, type DivergenceResult } from './divergence.js';
export { mainRepoRoot, branchExists, currentBranch, validateBranchName } from './git.js';
export {
  statePath,
  type DepsMode,
  type WorktreeRecord,
  type WorkspaceRecord,
  type WorkspaceRepoEntry,
  saveWorkspaceRecord,
  getWorkspaceRecords,
  findWorkspaceForWorktree,
  removeWorkspaceRecord,
} from './state.js';
export {
  sharedBranches,
  buildMultiRepoWorkspaceConfig,
  multiRepoWorkspaceFilePath,
  findWorkspaceConfigFile,
  findAllWorkspaceConfigFiles,
  readWorkspaceConfigFile,
  parseWorkspaceFileAsRecord,
  discoverWorkspaceRepoRoots,
  type CodeWorkspaceFolder,
  type CodeWorkspaceConfig,
} from './workspace.js';
export { exists } from './util/fs.js';

export { initVaultDatabase, getVaultDatabase, isVaultDatabaseReady } from './connection'
export { DEFAULT_PROJECT_NAME, DB_NAME, DB_VERSION } from './schema'
export type { Project, SaveTakeInput, VaultTake, VaultTakeUpdate } from './types'
export { findBestTakeId, loadUiTakesForProject, uiTakesFromVaultRows, uiTakesFromVaultRowsFast, vaultTakeToUiTake } from './takeBridge'
export {
  createProject,
  deleteVaultTake,
  deleteTakesByProject,
  getTakesByProject,
  listProjects,
  saveTake,
  setProjectBestTake,
  toggleBestTake,
  updateVaultTake,
} from './vaultRepository'

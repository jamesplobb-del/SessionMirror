export { initVaultDatabase, getVaultDatabase, isVaultDatabaseReady } from './connection'
export { DEFAULT_PROJECT_NAME, DB_NAME, DB_VERSION } from './schema'
export type { Project, VaultTake } from './types'
export {
  createProject,
  getTakesByProject,
  listProjects,
  saveTake,
  toggleBestTake,
} from './vaultRepository'

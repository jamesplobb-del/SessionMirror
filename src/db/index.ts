export { initVaultDatabase, getVaultDatabase, isVaultDatabaseReady } from './connection'
export { DEFAULT_PROJECT_NAME, DB_NAME, DB_VERSION } from './schema'
export type { Project, SaveTakeInput, VaultTake, VaultTakeUpdate } from './types'
export { findBestTakeId, hydrateVaultTakeRowsProgressive, loadUiTakesForProject, uiTakesFromVaultRows, uiTakesFromVaultRowsFast, vaultTakeToUiTake } from './takeBridge'
export {
  clearProjectBestTake,
  createProject,
  deleteProject,
  deleteVaultTake,
  deleteTakesByProject,
  getTakesByProject,
  listProjects,
  saveTake,
  setProjectBestTake,
  setTakeEnhancerBaked,
  toggleBestTake,
  updateVaultTake,
} from './vaultRepository'
export {
  deleteLibraryItem,
  deleteLibraryItemsByProject,
  getLibraryItemsByProject,
  getProjectBenchmarkBinding,
  saveLibraryAudioItem,
  setProjectBenchmarkBinding,
  setProjectLibraryBenchmark,
  updateLibraryItemName,
} from './libraryRepository'
export type { VaultLibraryItem } from './types'
export {
  clearPitchObservations,
  deletePitchObservationsInRange,
  listPitchObservations,
  savePitchObservation,
} from './pitchInsightsRepository'
export type {
  PitchObservation,
  SavePitchObservationInput,
} from './pitchInsightsRepository'

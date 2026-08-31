export { initVaultDatabase, getVaultDatabase, isVaultDatabaseReady } from './connection'
export { DEFAULT_PROJECT_NAME, DB_NAME, DB_VERSION } from './schema'
export type {
  BestTakeHistoryEntry,
  Project,
  SaveTakeInput,
  VaultTake,
  VaultTakeUpdate,
  PracticeComparisonMode,
  PracticeItemState,
  PracticeSession,
} from './types'
export { findBestTakeId, hydrateVaultTakeRowsProgressive, loadUiTakesForProject, uiTakesFromVaultRows, uiTakesFromVaultRowsFast, vaultTakeToUiTake } from './takeBridge'
export {
  clearProjectBestTake,
  createProject,
  deleteProject,
  deleteVaultTake,
  deleteTakesByProject,
  getTakesByProject,
  listBestTakeHistory,
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
  getPracticeItemState,
  listPracticeItemStates,
  listPracticeSessions,
  endPracticeSession,
  resumePracticeSession,
  startPracticeSession,
  updatePracticeItemState,
} from './practiceRepository'
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

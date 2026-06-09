/** A user-created session / project folder in the vault. */
export interface Project {
  id: string
  name: string
  /** Unix epoch milliseconds */
  createdAt: number
}

/** A recorded take row stored in SQLite (file lives on disk via Capacitor Filesystem). */
export interface VaultTake {
  id: string
  projectId: string
  filePath: string
  /** Duration in whole seconds */
  duration: number
  isBestTake: boolean
  /** Unix epoch milliseconds */
  createdAt: number
}

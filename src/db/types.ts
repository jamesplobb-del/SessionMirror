import type { MediaType } from '../types'

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
  name: string
  mimeType: string
  mediaType: MediaType
  rating: number
  notes: string
  recordingOrientation?: 'portrait' | 'landscape'
}

export interface SaveTakeInput {
  projectId: string
  filePath: string
  duration: number
  takeId?: string
  name?: string
  mimeType?: string
  mediaType?: MediaType
  recordingOrientation?: 'portrait' | 'landscape'
}

export type VaultTakeUpdate = Partial<Pick<VaultTake, 'name' | 'rating' | 'notes'>>

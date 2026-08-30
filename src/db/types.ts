import type { MediaType, PitchSample } from '../types'

export type PracticeComparisonMode =
  | 'current-best'
  | 'previous-take'
  | 'yesterday'
  | 'reference-track'

export interface PracticeSession {
  id: string
  projectId: string
  startedAt: number
  endedAt: number | null
  focusArea: string
  comparison: PracticeComparisonMode
}

export interface PracticeItemState {
  projectId: string
  focusArea: string
  comparison: PracticeComparisonMode
  loopStartSeconds: number | null
  loopEndSeconds: number | null
  pendingIntention: string
  lastSessionId: string | null
  lastOpenedAt: number
}

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
  /** Audio Enhancer was baked into the file after recording — playback must skip the live chain. */
  enhancerBaked: boolean
  timelineOffsetMs?: number
  practiceSessionId?: string
  intention: string
  pitchSeries?: PitchSample[]
  performanceStartSeconds?: number
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
  timelineOffsetMs?: number
  practiceSessionId?: string
  intention?: string
  pitchSeries?: PitchSample[]
  performanceStartSeconds?: number
}

export interface VaultLibraryItem {
  id: string
  projectId: string
  kind: 'audio'
  name: string
  createdAt: number
  filePath: string
  mimeType: string
  duration: number
}

export interface BenchmarkBindingRow {
  source: 'take' | 'library' | null
  refId: string | null
}

/** A take that was promoted to Best Take at some point in a project's history. */
export interface BestTakeHistoryEntry {
  id: string
  projectId: string
  projectName: string
  takeId: string
  takeName: string
  markedAt: number
  takeCreatedAt: number
  duration: number
  mediaType: MediaType
  isCurrentBest: boolean
}

export type VaultTakeUpdate = Partial<
  Pick<
    VaultTake,
    | 'name'
    | 'rating'
    | 'notes'
    | 'timelineOffsetMs'
    | 'intention'
    | 'pitchSeries'
    | 'performanceStartSeconds'
  >
>

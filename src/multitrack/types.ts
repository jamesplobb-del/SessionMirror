import type { Take } from '../types'

/** --- Legacy panel-grid types (unused by MVP overlay; kept for incremental cleanup) --- */

export type MultitrackPanelKind = 'performance' | 'sheet-music'

export interface SheetMusicAsset {
  src: string
  mimeType: string
  fileName: string
  x: number
  y: number
  scale: number
}

export interface PerformancePanelState {
  kind: 'performance'
  id: string
  take: Take | null
}

export interface SheetMusicPanelState {
  kind: 'sheet-music'
  id: string
  asset: SheetMusicAsset | null
}

export type MultitrackPanelState = PerformancePanelState | SheetMusicPanelState

export interface MultitrackLayoutPreset {
  id: string
  label: string
  panelCount: number
  areas: string[]
  columns: string
  rows: string
  defaultKinds: MultitrackPanelKind[]
}

export interface MultitrackPracticeSettings {
  showMetronome: boolean
  showPitch: boolean
  practiceOverlayEnabled: boolean
}

export interface MultitrackSession {
  layoutId: string
  panels: MultitrackPanelState[]
  practice: MultitrackPracticeSettings
}

export type MultitrackRecordingPhase = 'idle' | 'count-in' | 'recording'

/** --- Shared Practice Environment (backing + overdub MVP) --- */

export type MultitrackBackingKind = 'none' | 'mp3' | 'youtube'

export interface MultitrackBackingTrack {
  kind: MultitrackBackingKind
  name: string
  storageKey?: string
  objectUrl?: string
  youtubeUrl?: string
  duration: number
}

export interface MultitrackBox {
  id: string
  name: string
  storageKey: string
  objectUrl: string
  duration: number
  recordedAt: number
}

export interface MultitrackMixerLevels {
  performance: number
  backing: number
  metronome: number
  drone: number
}

export interface MultitrackWidgetVisibility {
  metronome: boolean
  pitch: boolean
  drone: boolean
  backingControls: boolean
}

export const DEFAULT_MIXER: MultitrackMixerLevels = {
  performance: 85,
  backing: 80,
  metronome: 70,
  drone: 65,
}

export const DEFAULT_WIDGETS: MultitrackWidgetVisibility = {
  metronome: true,
  pitch: false,
  drone: false,
  backingControls: true,
}

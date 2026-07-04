import type { Take } from '../types'

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

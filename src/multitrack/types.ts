import type { Take } from '../types'

export type MultitrackPanelKind = 'performance' | 'sheet-music'

export interface SheetMusicAsset {
  src: string
  mimeType: string
  fileName: string
  x: number
  y: number
  scale: number
  framePosition?: 'top' | 'bottom' | 'left' | 'right'
  frameScale?: number
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
}

export interface MultitrackPracticeSettings {
  showMetronome: boolean
  showPitch: boolean
  practiceOverlayEnabled: boolean
  clickEnabled: boolean
  countInBars: number
  bpm: number
}

export type MultitrackBackingTrack =
  | { kind: 'none'; volume: number }
  | { kind: 'audio'; src: string; fileName: string; mimeType: string; volume: number }
  | { kind: 'youtube'; embedUrl: string; label: string; volume: number }

export interface MultitrackSession {
  layoutId: string
  panels: MultitrackPanelState[]
  sheetMusic: SheetMusicPanelState
  practice: MultitrackPracticeSettings
  backing: MultitrackBackingTrack
}

export type MultitrackRecordingPhase = 'idle' | 'count-in' | 'recording' | 'review'

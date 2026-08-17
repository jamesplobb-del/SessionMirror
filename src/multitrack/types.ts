import type { Take } from '../types'

export type MultitrackPanelKind = 'performance' | 'sheet-music'

export interface SheetMusicAsset {
  src: string
  mimeType: string
  fileName: string
  x: number
  y: number
  scale: number
  /** Fill crops edge-to-edge; fit preserves the whole asset and may show margins. */
  contentMode?: 'fill' | 'fit'
  framePosition?: 'top' | 'bottom' | 'left' | 'right'
  frameScale?: number
}

export interface PerformancePanelState {
  kind: 'performance'
  id: string
  take: Take | null
  /** Mixer state — playback balance only (export stays unity gain for now). */
  volume?: number
  muted?: boolean
  /** Trim: timeline 0 maps to trimStartSec into the take; trimEndSec caps it. */
  trimStartSec?: number
  trimEndSec?: number
  /**
   * Optional song-section window. When set, the box only occupies the grid
   * between these timeline seconds — the remaining boxes reflow to fill the
   * canvas outside it. Both unset means the box is present for the whole song.
   */
  sectionStartSec?: number
  sectionEndSec?: number
}

/**
 * One image in the music panel's timeline. Musicians reading off a photo of the
 * page want to cut line to line, so the panel holds a sequence of screenshots
 * instead of a single picture: each cue takes over at `startSec` and stays up
 * until the next one starts.
 */
export interface SheetMusicCue {
  id: string
  asset: SheetMusicAsset
  startSec: number
}

export interface SheetMusicPanelState {
  kind: 'sheet-music'
  id: string
  /**
   * The first image — on screen from timeline zero, and the one whose
   * framePosition/frameScale place the panel in the grid for the whole song.
   */
  asset: SheetMusicAsset | null
  /** Later images, each cutting in at its own timeline second. */
  cues?: SheetMusicCue[]
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

export type MultitrackRecordingPhase = 'idle' | 'arming' | 'count-in' | 'recording' | 'review'

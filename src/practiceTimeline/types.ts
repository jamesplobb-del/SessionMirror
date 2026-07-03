import type { MetronomeMeter, MetronomeSubdivision, MetronomeAccentLevel } from '../utils/metronomeConfig'

export type SectionSubdivision = 'auto' | MetronomeSubdivision

export type CountInWhen = 'start' | 'every-loop'

export interface PracticeTrackSettings {
  /** 0 = off. Uses first section meter/tempo when counting in. */
  countInBars: number
  /** When to play count-in during a session. */
  countInWhen: CountInWhen
  /** Loop the full routine when the last section ends. */
  loopTrack: boolean
}

export interface TempoRamp {
  enabled: boolean
  endBpm: number
}

export interface SectionAdvanced {
  beatGrouping?: number[]
  customAccents?: MetronomeAccentLevel[]
  tempoRamp?: TempoRamp
  swing?: number
  clickSoundId?: string
  pickupMeasure?: boolean
  /** Per-section count-in overrides track count-in when > 0. */
  countInBars?: number
  color?: string
  markerNotes?: string
}

export interface TimelineSection {
  id: string
  title: string
  bars: number
  bpm: number
  meter: MetronomeMeter
  feelId?: string
  subdivision: SectionSubdivision
  /** How many times this section plays in a row (1 = once). */
  repeatCount: number
  advanced?: SectionAdvanced
}

export interface PracticeTimeline {
  id: string
  name: string
  sections: TimelineSection[]
  favorite: boolean
  settings?: PracticeTrackSettings
  createdAt: number
  updatedAt: number
}

export interface PracticeTimelineMarker {
  sectionId: string
  title: string
  timeSeconds: number
  bars: number
  meter: MetronomeMeter
  bpm: number
}

export interface TimelinePlaybackState {
  sessionActive: boolean
  playing: boolean
  finished: boolean
  sectionIndex: number
  measure: number
  totalMeasuresInSection: number
  elapsedSeconds: number
  tempoScale: number
  effectiveBpm: number
  countInActive: boolean
}

export const PRACTICE_TIMELINE_EXPORT_VERSION = 1

export interface PracticeTimelineExport {
  version: typeof PRACTICE_TIMELINE_EXPORT_VERSION
  timeline: PracticeTimeline
}

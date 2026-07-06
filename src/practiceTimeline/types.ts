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

export type TempoRampShape = 'linear' | 'stepped' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface TempoRamp {
  enabled: boolean
  endBpm: number
  /** How tempo moves between start and end across the section. */
  shape?: TempoRampShape
}

/** Explicit tempo at a bar or beat within a section (overrides ramp). */
export interface SectionTempoMarker {
  id: string
  /** 1-based bar in the section. */
  measure: number
  /** 1-based conducting pulse; omit for bar-line change. */
  beat?: number
  bpm: number
}

export interface SectionAdvanced {
  beatGrouping?: number[]
  customAccents?: MetronomeAccentLevel[]
  tempoRamp?: TempoRamp
  tempoMarkers?: SectionTempoMarker[]
  swing?: number
  clickSoundId?: string
  pickupMeasure?: boolean
  /** Per-section count-in overrides track count-in when > 0. */
  countInBars?: number
  color?: string
  markerNotes?: string
}

/** One step in an alternating / mixed meter pattern within a section. */
export interface MeterPatternStep {
  id: string
  meter: MetronomeMeter
  pulseModeId?: string
  feelId?: string
  /** @deprecated Legacy — use section.bpm + derivePatternStepBpm. Stripped on normalize. */
  bpm?: number
  subdivision: SectionSubdivision
  /** Bars at this meter before advancing (default 1). */
  bars?: number
  beatGrouping?: number[]
  customAccents?: MetronomeAccentLevel[]
}

/** How a meter pattern repeats within a section. */
export type PatternRepeatMode =
  | { kind: 'cycles'; cycles: number }
  | { kind: 'totalMeasures'; measures: number }

export interface TimelineSection {
  id: string
  title: string
  bars: number
  bpm: number
  meter: MetronomeMeter
  /** Overrides default pulse unit for this meter (e.g. simple 6/8 vs compound). */
  pulseModeId?: string
  feelId?: string
  subdivision: SectionSubdivision
  /** How many times this section plays in a row (1 = once). */
  repeatCount: number
  /** When set, section alternates through these meters instead of a single meter. */
  patternSteps?: MeterPatternStep[]
  /** How the pattern repeats (cycles or total measures). */
  patternRepeat?: PatternRepeatMode
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
  /** Active pattern step when section uses meter pattern mode. */
  patternStepIndex?: number
  patternStepMeter?: MetronomeMeter
  patternLabel?: string
}

export const PRACTICE_TIMELINE_EXPORT_VERSION = 1

export interface PracticeTimelineExport {
  version: typeof PRACTICE_TIMELINE_EXPORT_VERSION
  timeline: PracticeTimeline
}

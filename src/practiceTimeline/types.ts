import type { MetronomeMeter, MetronomeSubdivision, MetronomeAccentLevel } from '../utils/metronomeConfig'

export type SectionSubdivision = 'auto' | MetronomeSubdivision
export type SectionRepeat = 'none' | '2x' | '3x' | '4x'

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
  repeat: SectionRepeat
  advanced?: SectionAdvanced
}

export interface PracticeTimeline {
  id: string
  name: string
  sections: TimelineSection[]
  favorite: boolean
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
  playing: boolean
  finished: boolean
  sectionIndex: number
  measure: number
  totalMeasuresInSection: number
  elapsedSeconds: number
}

export const PRACTICE_TIMELINE_EXPORT_VERSION = 1

export interface PracticeTimelineExport {
  version: typeof PRACTICE_TIMELINE_EXPORT_VERSION
  timeline: PracticeTimeline
}

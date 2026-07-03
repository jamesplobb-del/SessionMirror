import type { MetronomeMeter } from '../../utils/metronomeConfig'
import type { MeterPatternStep, PatternRepeatMode, SectionSubdivision, TempoRamp } from '../types'

/** Confidence 0–1 on any detected item. */
export type ScanConfidence = number

export interface ScanSourceRef {
  page: number
  notes?: string
}

export interface ScanTempoEvent {
  id: string
  measure: number
  bpm: number
  marking?: string
  kind?: 'tempo' | 'ritardando' | 'accelerando' | 'a_tempo'
  confidence: ScanConfidence
  uncertain?: boolean
  source?: ScanSourceRef
}

export interface ScanMeterEvent {
  id: string
  measure: number
  meter: string
  pulseUnit?: string
  grouping?: number[]
  feelLabel?: string
  confidence: ScanConfidence
  uncertain?: boolean
  source?: ScanSourceRef
}

export interface ScanRepeatBlock {
  id: string
  fromMeasure: number
  toMeasure: number
  times: number
  confidence: ScanConfidence
  uncertain?: boolean
}

export interface ScanEnding {
  id: string
  label: string
  measures: number[]
  confidence: ScanConfidence
  uncertain?: boolean
}

export interface ScanNavigationMarker {
  id: string
  type: 'DC' | 'DS' | 'Fine' | 'Coda' | 'Segno'
  measure: number
  targetMeasure?: number
  label?: string
  confidence: ScanConfidence
  uncertain?: boolean
}

/** Raw JSON shape returned by the vision parser. */
export interface MusicScanParseResult {
  title?: string
  totalMeasures?: number
  pickupMeasure?: boolean
  sections: Array<{
    title?: string
    startMeasure: number
    endMeasure: number
    meter?: string
    bpm?: number
    tempoMarking?: string
    pulseUnit?: string
    grouping?: number[]
    feelLabel?: string
    subdivision?: string
    pickupMeasure?: boolean
    repeatCount?: number
    ritardando?: boolean
    accelerando?: boolean
    endBpm?: number
    confidence?: number
    uncertain?: boolean
    sourcePages?: number[]
    notes?: string
  }>
  tempoEvents?: Array<{
    measure: number
    bpm?: number
    marking?: string
    kind?: string
    confidence?: number
    uncertain?: boolean
    page?: number
  }>
  meterEvents?: Array<{
    measure: number
    meter?: string
    grouping?: number[]
    feelLabel?: string
    confidence?: number
    uncertain?: boolean
    page?: number
  }>
  repeatBlocks?: Array<{
    fromMeasure: number
    toMeasure: number
    times?: number
    confidence?: number
    uncertain?: boolean
  }>
  endings?: Array<{
    label?: string
    measures?: number[]
    confidence?: number
    uncertain?: boolean
  }>
  navigation?: Array<{
    type?: string
    measure?: number
    targetMeasure?: number
    label?: string
    confidence?: number
    uncertain?: boolean
  }>
  warnings?: string[]
}

/** Editable draft before applying to a practice timeline. */
export interface MusicScanDraftSection {
  id: string
  title: string
  startMeasure: number
  endMeasure: number
  meter: MetronomeMeter
  pulseModeId?: string
  feelId?: string
  beatGrouping?: number[]
  bpm: number
  subdivision: SectionSubdivision
  repeatCount: number
  pickupMeasure: boolean
  tempoRamp?: TempoRamp
  patternSteps?: MeterPatternStep[]
  patternRepeat?: PatternRepeatMode
  repeatBlock?: ScanRepeatBlock
  endings: ScanEnding[]
  navigation: ScanNavigationMarker[]
  confidence: ScanConfidence
  uncertain: boolean
  notes?: string
  sourcePages: number[]
}

export interface MusicScanDraftProgram {
  id: string
  title: string
  sections: MusicScanDraftSection[]
  tempoEvents: ScanTempoEvent[]
  meterEvents: ScanMeterEvent[]
  repeatBlocks: ScanRepeatBlock[]
  endings: ScanEnding[]
  navigation: ScanNavigationMarker[]
  pickupMeasure: boolean
  totalMeasures: number
  warnings: string[]
  sourceFiles: Array<{ name: string; mimeType: string; pageCount: number }>
  scannedAt: number
  usedDemoParser: boolean
}

export interface MusicScanPageImage {
  page: number
  dataUrl: string
  width: number
  height: number
}

export type MusicScanApplyMode = 'replace' | 'append'

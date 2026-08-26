import { clampBpm } from '../utils/metronomeConfig'
import { locatePatternStep, sectionHasMeterPattern } from './patternLogic'
import { derivePatternStepBpm } from './patternTempo'
import { effectiveBars } from './timeSignatureLogic'
import type { SectionTempoMarker, TempoRamp, TempoRampShape, TimelineSection } from './types'

export function applyRampCurve(t: number, shape: TempoRampShape = 'linear'): number {
  const clamped = Math.max(0, Math.min(1, t))
  switch (shape) {
    case 'stepped':
      return clamped
    case 'ease-in':
      return clamped * clamped
    case 'ease-out':
      return clamped * (2 - clamped)
    case 'ease-in-out':
      return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2
    case 'linear':
    default:
      return clamped
  }
}

/** 0 at section start → 1 at section end. */
export function sectionProgressAt(
  measure: number,
  beat: number,
  pulseCount: number,
  totalMeasures: number,
  shape: TempoRampShape,
): number {
  if (totalMeasures <= 1) return 0
  const barIndex = measure - 1
  if (shape === 'stepped') {
    return barIndex / (totalMeasures - 1)
  }
  const beatsPerSection = totalMeasures * pulseCount
  const beatIndex = barIndex * pulseCount + (beat - 1)
  return beatIndex / (beatsPerSection - 1)
}

export function interpolateRampBpm(
  startBpm: number,
  endBpm: number,
  progress: number,
  shape: TempoRampShape = 'linear',
): number {
  const curved = applyRampCurve(progress, shape)
  return Math.round(startBpm + (endBpm - startBpm) * curved)
}

/**
 * The pin in force at a position — the latest one at or before it.
 *
 * A pin reads as a written tempo marking, so it holds from where it is placed
 * until the next pin or the end of the section, rather than colouring a single
 * beat and reverting.
 */
export function findTempoMarker(
  markers: SectionTempoMarker[] | undefined,
  measure: number,
  beat: number,
): SectionTempoMarker | undefined {
  if (!markers?.length) return undefined

  let active: SectionTempoMarker | undefined
  for (const marker of markers) {
    const markerBeat = marker.beat ?? 1
    if (marker.measure > measure) continue
    if (marker.measure === measure && markerBeat > beat) continue
    if (
      !active ||
      marker.measure > active.measure ||
      (marker.measure === active.measure && markerBeat >= (active.beat ?? 1))
    ) {
      active = marker
    }
  }
  return active
}

export function resolveMasterBpmAt(
  section: TimelineSection,
  measure: number,
  beat: number,
  pulseCount: number,
  ramp?: TempoRamp,
): number {
  const totalMeasures = effectiveBars(section)
  if (!ramp?.enabled || totalMeasures <= 1) return section.bpm
  const shape = ramp.shape ?? 'linear'
  const progress = sectionProgressAt(measure, beat, pulseCount, totalMeasures, shape)
  return interpolateRampBpm(section.bpm, ramp.endBpm, progress, shape)
}

/** Final metronome BPM at a position in the section (markers → ramp → base). */
export function resolveSectionPlaybackBpm(
  section: TimelineSection,
  measure: number,
  beat = 1,
  pulseCount = 4,
): number {
  // A pin overrides the ramp for as long as it is in force. Like section.bpm it
  // is a master tempo, so a meter pattern still converts it to the step's pulse.
  const marker = findTempoMarker(section.advanced?.tempoMarkers, measure, beat)
  const masterBpm = marker
    ? clampBpm(marker.bpm)
    : resolveMasterBpmAt(section, measure, beat, pulseCount, section.advanced?.tempoRamp)

  if (sectionHasMeterPattern(section)) {
    const { step } = locatePatternStep(section, measure)
    return derivePatternStepBpm(masterBpm, step)
  }

  return masterBpm
}

let tempoMarkerCounter = 0

export function createTempoMarkerId(): string {
  tempoMarkerCounter += 1
  return `tempo-marker-${Date.now()}-${tempoMarkerCounter}`
}

export function tempoRampShapeLabel(shape: TempoRampShape | undefined): string {
  switch (shape ?? 'linear') {
    case 'stepped':
      return 'Stepped'
    case 'ease-in':
      return 'Ease in'
    case 'ease-out':
      return 'Ease out'
    case 'ease-in-out':
      return 'Ease in/out'
    case 'linear':
    default:
      return 'Linear'
  }
}

export function tempoMarkersSummary(section: TimelineSection): string | null {
  const markers = section.advanced?.tempoMarkers
  if (!markers?.length) return null
  return `${markers.length} tempo change${markers.length === 1 ? '' : 's'}`
}

import {
  formatBpmLabel,
  resolvePulseTiming,
  type ResolvedPulseTiming,
} from '../metronome/pulseResolution'
import {
  getMeterDefaults,
  suggestSubdivisionForMeterChange,
  type MetronomeAccentLevel,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'
import { repeatMultiplier } from './sectionDefaults'
import type { MeterPatternStep, PatternRepeatMode, TimelineSection } from './types'
import type { ResolvedSectionTiming } from './timeSignatureLogic'
import { resolveSectionTiming } from './timeSignatureLogic'

let patternStepCounter = 0

export function createPatternStepId(): string {
  patternStepCounter += 1
  return `pattern-step-${Date.now()}-${patternStepCounter}`
}

export function createPatternStep(
  meter: MetronomeMeter,
  bpm: number,
  overrides?: Partial<MeterPatternStep>,
): MeterPatternStep {
  const defaults = getMeterDefaults(meter, overrides?.pulseModeId)
  return {
    id: createPatternStepId(),
    meter,
    pulseModeId: defaults.pulseModeId,
    feelId: defaults.feelId,
    bpm,
    subdivision: 'auto',
    bars: 1,
    ...overrides,
  }
}

export function sectionHasMeterPattern(section: TimelineSection): boolean {
  return Boolean(section.patternSteps && section.patternSteps.length > 0)
}

export function patternStepBars(step: MeterPatternStep): number {
  return Math.max(1, Math.min(32, Math.round(step.bars ?? 1)))
}

export function patternCycleBars(steps: MeterPatternStep[]): number {
  return steps.reduce((sum, step) => sum + patternStepBars(step), 0)
}

export function defaultPatternRepeat(steps: MeterPatternStep[]): PatternRepeatMode {
  const cycle = patternCycleBars(steps)
  return { kind: 'cycles', cycles: Math.max(1, Math.ceil(8 / cycle)) }
}

export function patternMeasuresBeforeRepeat(section: TimelineSection): number {
  const steps = section.patternSteps ?? []
  if (steps.length === 0) return section.bars

  const cycle = patternCycleBars(steps)
  const repeat = section.patternRepeat ?? defaultPatternRepeat(steps)

  if (repeat.kind === 'totalMeasures') {
    return Math.max(cycle, Math.min(512, Math.round(repeat.measures)))
  }

  const cycles = Math.max(1, Math.min(99, Math.round(repeat.cycles)))
  return cycle * cycles
}

export interface PatternStepPosition {
  stepIndex: number
  step: MeterPatternStep
  measureInStep: number
  cycleIndex: number
  previousStep?: MeterPatternStep
}

export function locatePatternStep(section: TimelineSection, measure: number): PatternStepPosition {
  const steps = section.patternSteps ?? []
  const cycleBars = patternCycleBars(steps)
  const safeMeasure = Math.max(1, Math.round(measure))
  const indexInSection = safeMeasure - 1
  const cycleIndex = Math.floor(indexInSection / cycleBars)
  let offsetInCycle = indexInSection % cycleBars

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex]
    const bars = patternStepBars(step)
    if (offsetInCycle < bars) {
      return {
        stepIndex,
        step,
        measureInStep: offsetInCycle + 1,
        cycleIndex,
        previousStep: stepIndex > 0 ? steps[stepIndex - 1] : steps[steps.length - 1],
      }
    }
    offsetInCycle -= bars
  }

  const last = steps[steps.length - 1]
  return {
    stepIndex: steps.length - 1,
    step: last,
    measureInStep: patternStepBars(last),
    cycleIndex,
    previousStep: steps.length > 1 ? steps[steps.length - 2] : last,
  }
}

export function resolvePatternStepTiming(
  step: MeterPatternStep,
  previousStep?: MeterPatternStep,
): ResolvedSectionTiming {
  const pulse: ResolvedPulseTiming = resolvePulseTiming({
    meter: step.meter,
    pulseModeId: step.pulseModeId,
    feelId: step.feelId,
    beatGrouping: step.beatGrouping,
    customAccents: step.customAccents,
  })

  let subdivision: MetronomeSubdivision
  if (step.subdivision !== 'auto') {
    subdivision = step.subdivision
  } else if (previousStep) {
    const prev = resolvePatternStepTiming(previousStep)
    subdivision = suggestSubdivisionForMeterChange(
      step.meter,
      previousStep.meter,
      prev.subdivision,
      pulse.pulseModeId,
      prev.pulseModeId,
    )
  } else {
    subdivision = pulse.defaultSubdivision
  }

  return { ...pulse, subdivision }
}

export interface ResolvedMeasureTiming extends ResolvedSectionTiming {
  stepIndex?: number
  stepBpm: number
  patternStep?: MeterPatternStep
}

export function resolveSectionTimingAtMeasure(
  section: TimelineSection,
  measure: number,
  previousSection?: TimelineSection,
): ResolvedMeasureTiming {
  if (!sectionHasMeterPattern(section)) {
    const timing = resolveSectionTiming(section, previousSection)
    return { ...timing, stepBpm: section.bpm }
  }

  const { step, stepIndex, previousStep } = locatePatternStep(section, measure)
  const timing = resolvePatternStepTiming(step, previousStep)
  return {
    ...timing,
    stepIndex,
    stepBpm: step.bpm,
    patternStep: step,
  }
}

export function formatPatternMetersLabel(steps: MeterPatternStep[]): string {
  return steps.map((step) => step.meter).join(' + ')
}

export function formatPatternBpmLabel(steps: MeterPatternStep[]): string {
  const labels = steps.map((step) => {
    const timing = resolvePatternStepTiming(step)
    return formatBpmLabel(step.bpm, timing)
  })
  const unique = [...new Set(labels)]
  return unique.join(' / ')
}

export function patternRepeatSummary(section: TimelineSection): string {
  if (!sectionHasMeterPattern(section)) return ''

  const repeat = section.patternRepeat ?? defaultPatternRepeat(section.patternSteps!)
  if (repeat.kind === 'totalMeasures') {
    return `until m. ${repeat.measures}`
  }
  return `${repeat.cycles}× pattern`
}

export function patternSectionSummary(section: TimelineSection): string {
  const steps = section.patternSteps ?? []
  if (steps.length === 0) return ''

  const meters = formatPatternMetersLabel(steps)
  const bpms = formatPatternBpmLabel(steps)
  const repeat = patternRepeatSummary(section)
  const parts = [meters]
  if (repeat) parts.push(repeat)
  parts.push(bpms)
  return parts.join(' • ')
}

export function effectivePatternBars(section: TimelineSection): number {
  return patternMeasuresBeforeRepeat(section) * repeatMultiplier(section.repeatCount)
}

export function applyMeterChangeToPatternStep(
  step: MeterPatternStep,
  nextMeter: MetronomeMeter,
): MeterPatternStep {
  const defaults = getMeterDefaults(nextMeter)
  return {
    ...step,
    meter: nextMeter,
    pulseModeId: defaults.pulseModeId,
    feelId: defaults.feelId,
    subdivision: 'auto',
    beatGrouping: undefined,
    customAccents: undefined,
  }
}

export function validatePatternStepGrouping(
  step: MeterPatternStep,
  grouping: number[],
): boolean {
  const resolved = resolvePatternStepTiming(step)
  const sum = grouping.reduce((total, value) => total + value, 0)
  return sum === resolved.pulseCount
}

export function patternStepAccentLevels(step: MeterPatternStep): MetronomeAccentLevel[] {
  const timing = resolvePatternStepTiming(step)
  return step.customAccents?.length ? step.customAccents : timing.accentLevels
}

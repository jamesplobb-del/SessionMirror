import type { MetronomeAudioSelectOption } from '../components/audioPractice/MetronomeAudioSelect'
import { PRACTICE_CORE_METERS } from '../components/audioPractice/audioPracticeMetronome'
import type { MetronomeMeter, MetronomeSubdivision } from '../utils/metronomeConfig'
import { COMMON_METERS } from './sectionDefaults'
import type { PatternRepeatMode, SectionSubdivision, TempoRampShape } from './types'

function meterLabel(meter: MetronomeMeter): string {
  return meter
}

type HeaderValue = '__header_common__' | '__header_more__'

export function meterSelectOptions(
  meters: MetronomeMeter[] = COMMON_METERS,
): MetronomeAudioSelectOption<MetronomeMeter | HeaderValue>[] {
  const core = meters.filter((meter) => PRACTICE_CORE_METERS.includes(meter))
  const more = meters.filter((meter) => !PRACTICE_CORE_METERS.includes(meter))
  const options: MetronomeAudioSelectOption<MetronomeMeter | HeaderValue>[] = []

  if (core.length > 0) {
    options.push({ value: '__header_common__', label: 'Common', disabled: true })
    for (const meter of core) {
      options.push({ value: meter, label: meterLabel(meter) })
    }
  }

  if (more.length > 0) {
    options.push({ value: '__header_more__', label: 'More time signatures', disabled: true })
    for (const meter of more) {
      options.push({ value: meter, label: meterLabel(meter) })
    }
  }

  return options
}

export function pulseSelectOptions(
  modes: { id: string; label: string }[],
): MetronomeAudioSelectOption<string>[] {
  return modes.map((mode) => ({ value: mode.id, label: mode.label }))
}

export function feelSelectOptions(
  options: { id: string; label: string }[],
): MetronomeAudioSelectOption<string>[] {
  return options.map((option) => ({ value: option.id, label: option.label }))
}

const SUBDIVISION_LABELS: Record<MetronomeSubdivision, string> = {
  off: 'Pulse only',
  '8ths': '8ths',
  '16ths': '16ths',
  triplets: 'Triplets',
  dotted: 'Dotted',
  quints: 'Quintuplets',
  septuplets: 'Septuplets',
}

export function subdivisionSelectOptions(
  choices: { id: SectionSubdivision; label: string }[],
): MetronomeAudioSelectOption<SectionSubdivision>[] {
  return choices.map((choice) => ({
    value: choice.id,
    label:
      choice.id === 'auto'
        ? 'Auto'
        : SUBDIVISION_LABELS[choice.id as MetronomeSubdivision] ?? choice.label,
  }))
}

export type SectionTypeValue = 'single' | 'pattern'

export const SECTION_TYPE_OPTIONS: MetronomeAudioSelectOption<SectionTypeValue>[] = [
  { value: 'single', label: 'One signature' },
  { value: 'pattern', label: 'Alternating' },
]

export type CountInWhenValue = 'start' | 'every-loop'

export const COUNT_IN_WHEN_OPTIONS: MetronomeAudioSelectOption<CountInWhenValue>[] = [
  { value: 'start', label: 'Start only' },
  { value: 'every-loop', label: 'Every loop' },
]

export type PatternRepeatKind = PatternRepeatMode['kind']

export const PATTERN_REPEAT_OPTIONS: MetronomeAudioSelectOption<PatternRepeatKind>[] = [
  { value: 'cycles', label: 'Cycles' },
  { value: 'totalMeasures', label: 'Bars' },
]

export type TempoRampMode = 'off' | 'faster' | 'slower'

export const TEMPO_RAMP_OPTIONS: MetronomeAudioSelectOption<TempoRampMode>[] = [
  { value: 'off', label: 'Steady' },
  { value: 'faster', label: 'Speed up' },
  { value: 'slower', label: 'Slow down' },
]

export function tempoRampModeFromSection(section: {
  bpm: number
  advanced?: { tempoRamp?: { enabled?: boolean; endBpm?: number } }
}): TempoRampMode {
  const ramp = section.advanced?.tempoRamp
  if (!ramp?.enabled) return 'off'
  return (ramp.endBpm ?? section.bpm) >= section.bpm ? 'faster' : 'slower'
}

export const TEMPO_RAMP_SHAPE_OPTIONS: MetronomeAudioSelectOption<TempoRampShape>[] = [
  { value: 'linear', label: 'Smooth' },
  { value: 'stepped', label: 'Steps' },
  { value: 'ease-in', label: 'Ease in' },
  { value: 'ease-out', label: 'Ease out' },
  { value: 'ease-in-out', label: 'Ease both' },
]

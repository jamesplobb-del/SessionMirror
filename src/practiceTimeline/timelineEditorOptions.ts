import type { MetronomeAudioSelectOption } from '../components/audioPractice/MetronomeAudioSelect'
import { PRACTICE_CORE_METERS } from '../components/audioPractice/audioPracticeMetronome'
import type { MetronomeMeter, MetronomeSubdivision } from '../utils/metronomeConfig'
import { COMMON_METERS } from './sectionDefaults'
import type { PatternRepeatMode, SectionSubdivision, TempoRampShape } from './types'

const METER_HINTS: Partial<Record<MetronomeMeter, string>> = {
  '2/4': 'March — 2 beats',
  '3/4': 'Waltz — 3 beats',
  '4/4': 'Common time — 4 beats',
  '5/4': '5 beats',
  '6/4': '6 quarter beats',
  '7/4': '7 beats',
  '2/2': 'Cut time — 2 half beats',
  '3/8': '3 eighth notes',
  '4/8': '4 eighth notes',
  '6/8': 'Compound — 2 dotted quarters',
  '9/8': 'Compound — 3 dotted quarters',
  '12/8': 'Compound — 4 dotted quarters',
  '5/8': 'Odd — 5 eighths',
  '7/8': 'Odd — 7 eighths',
  '8/8': 'Odd — 8 eighths',
  '10/8': 'Odd — 10 eighths',
  '11/8': 'Odd — 11 eighths',
  '13/8': 'Odd — 13 eighths',
  '15/8': 'Odd — 15 eighths',
  '16/8': 'Odd — 16 eighths',
}

function meterLabel(meter: MetronomeMeter): string {
  const hint = METER_HINTS[meter]
  return hint ? `${meter} — ${hint}` : meter
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
  off: 'Pulse only — no extra clicks',
  '8ths': 'Eighth notes',
  '16ths': 'Sixteenth notes',
  triplets: 'Triplets',
  dotted: 'Dotted rhythm',
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
        ? 'Auto — match the meter'
        : SUBDIVISION_LABELS[choice.id as MetronomeSubdivision] ?? choice.label,
  }))
}

export type SectionTypeValue = 'single' | 'pattern'

export const SECTION_TYPE_OPTIONS: MetronomeAudioSelectOption<SectionTypeValue>[] = [
  { value: 'single', label: 'Single meter — one time signature' },
  { value: 'pattern', label: 'Meter pattern — alternating meters' },
]

export type CountInWhenValue = 'start' | 'every-loop'

export const COUNT_IN_WHEN_OPTIONS: MetronomeAudioSelectOption<CountInWhenValue>[] = [
  { value: 'start', label: 'Start & section jumps' },
  { value: 'every-loop', label: 'Every loop' },
]

export type PatternRepeatKind = PatternRepeatMode['kind']

export const PATTERN_REPEAT_OPTIONS: MetronomeAudioSelectOption<PatternRepeatKind>[] = [
  { value: 'cycles', label: 'Repeat a set number of times' },
  { value: 'totalMeasures', label: 'Play until a measure number' },
]

export type TempoRampMode = 'off' | 'faster' | 'slower'

export const TEMPO_RAMP_OPTIONS: MetronomeAudioSelectOption<TempoRampMode>[] = [
  { value: 'off', label: 'Steady tempo' },
  { value: 'faster', label: 'Gradually faster (accel.)' },
  { value: 'slower', label: 'Gradually slower (rit.)' },
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
  { value: 'linear', label: 'Smooth (linear)' },
  { value: 'stepped', label: 'Stepped (per bar)' },
  { value: 'ease-in', label: 'Ease in' },
  { value: 'ease-out', label: 'Ease out' },
  { value: 'ease-in-out', label: 'Ease in / out' },
]

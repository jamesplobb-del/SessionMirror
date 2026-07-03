import {
  getAvailableSubdivisions,
  getSubdivisionLabel,
  hasFeelOptions,
  subdivisionsPerBeat,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../../utils/metronomeConfig'
import { getPulseModeById, meterHasPulseModeChoice, METER_PULSE_MODES } from '../../metronome/pulseModes'

export const AUDIO_PRACTICE_MIN_BPM = 30
export const AUDIO_PRACTICE_MAX_BPM = 240
export const AUDIO_PRACTICE_DEFAULT_BPM = 120

export function clampAudioPracticeBpm(value: number): number {
  return Math.min(
    AUDIO_PRACTICE_MAX_BPM,
    Math.max(AUDIO_PRACTICE_MIN_BPM, Math.round(value)),
  )
}

/** First visible window (5 across): 2/4, 3/4, 4/4, 5/4, 6/8 */
export const PRACTICE_CORE_METERS: MetronomeMeter[] = ['2/4', '3/4', '4/4', '5/4', '6/8']

export const PRACTICE_EXTENDED_METERS: MetronomeMeter[] = [
  '3/8',
  '4/8',
  '9/8',
  '12/8',
  '13/8',
  '15/8',
  '16/8',
  '6/4',
  '7/4',
  '2/2',
  '3/2',
  '4/2',
  '5/2',
  '6/2',
  '7/2',
  '5/8',
  '7/8',
  '8/8',
  '10/8',
  '11/8',
  '3/16',
  '5/16',
  '7/16',
  '9/16',
  '11/16',
  '13/16',
  '15/16',
  '16/16',
]

export const PRACTICE_ALL_METERS: MetronomeMeter[] = [
  ...PRACTICE_CORE_METERS,
  ...PRACTICE_EXTENDED_METERS,
]

export interface PracticeRhythmOption {
  id: string
  value: MetronomeSubdivision
  label: string
  name: string
  ticksPerBeat: number
}

const RHYTHM_LABELS: Record<MetronomeSubdivision, { id: string; label: string }> = {
  off: { id: 'pulse', label: '♩' },
  '8ths': { id: 'eighth', label: '♪' },
  triplets: { id: 'triplet', label: '♪3' },
  '16ths': { id: 'sixteenth', label: '♬' },
  dotted: { id: 'dotted', label: '♩·' },
  quints: { id: 'quintuplet', label: '5' },
  septuplets: { id: 'septuplet', label: '7' },
}

export function getPracticeRhythmOptions(
  meter: MetronomeMeter,
  pulseModeId?: string,
): PracticeRhythmOption[] {
  return getAvailableSubdivisions(meter, pulseModeId).map((value) => {
    const mode = getPulseModeById(meter, pulseModeId)
    const meta = RHYTHM_LABELS[value]
    const name = value === 'off' ? mode.pulseName : getSubdivisionLabel(meter, value)
    return {
      id: meta.id,
      value,
      label: meta.label,
      name,
      ticksPerBeat: subdivisionsPerBeat(value),
    }
  })
}

export function getPracticeFeelOptions(
  meter: MetronomeMeter,
  pulseModeId?: string,
): { value: string; label: string }[] {
  const mode = getPulseModeById(meter, pulseModeId)
  if (!mode.feelOptions?.length) return []
  return mode.feelOptions.map((option) => ({ value: option.id, label: option.label }))
}

export function getPracticePulseModeOptions(meter: MetronomeMeter): { value: string; label: string }[] {
  return METER_PULSE_MODES[meter].map((mode) => ({ value: mode.id, label: mode.label }))
}

export function practiceMeterHasPulseChoice(meter: MetronomeMeter): boolean {
  return meterHasPulseModeChoice(meter)
}

export function practiceMeterHasFeelOptions(meter: MetronomeMeter, pulseModeId?: string): boolean {
  return hasFeelOptions(meter, pulseModeId)
}

/** UI-only until sound engine supports multiple click timbres. */
export const AUDIO_PRACTICE_CLICK_SOUNDS = [
  { id: 'classic', label: 'Classic' },
  { id: 'woodblock', label: 'Woodblock' },
  { id: 'soft', label: 'Soft' },
  { id: 'electronic', label: 'Electronic' },
] as const

export type AudioPracticeClickSoundId = (typeof AUDIO_PRACTICE_CLICK_SOUNDS)[number]['id']

/** @deprecated Use getPracticeRhythmOptions(meter) */
export const PRACTICE_ALL_RHYTHM_OPTIONS: PracticeRhythmOption[] = getPracticeRhythmOptions('4/4')

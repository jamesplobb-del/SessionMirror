import {
  getAvailableSubdivisions,
  getSubdivisionLabel,
  hasFeelOptions,
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
  /** Note value this rhythm actually plays under the CURRENT pulse. */
  name: string
}

/**
 * Stable ids per subdivision.
 *
 * There is deliberately no fixed glyph or tick count here: both depend on the
 * pulse, not on the subdivision id. Under an eighth pulse '8ths' plays
 * sixteenths and under a dotted quarter it plays the three natural eighths, so
 * a per-id '♪' and a per-id 2 are wrong in every meter but a simple one. The
 * drawn cell and `name` are both derived from the active pulse instead.
 */
const RHYTHM_IDS: Record<MetronomeSubdivision, string> = {
  off: 'pulse',
  '8ths': 'eighth',
  triplets: 'triplet',
  '16ths': 'sixteenth',
  dotted: 'dotted',
  quints: 'quintuplet',
  septuplets: 'septuplet',
}

export function getPracticeRhythmOptions(
  meter: MetronomeMeter,
  pulseModeId?: string,
): PracticeRhythmOption[] {
  const mode = getPulseModeById(meter, pulseModeId)
  return getAvailableSubdivisions(meter, pulseModeId).map((value) => ({
    id: RHYTHM_IDS[value],
    value,
    name: getSubdivisionLabel(meter, value, mode.pulseCount),
  }))
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

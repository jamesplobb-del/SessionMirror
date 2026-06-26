import type { MetronomeMeter, MetronomeSubdivision } from '../../utils/metronomeConfig'

export const AUDIO_PRACTICE_MIN_BPM = 30
export const AUDIO_PRACTICE_MAX_BPM = 240
export const AUDIO_PRACTICE_DEFAULT_BPM = 120

export function clampAudioPracticeBpm(value: number): number {
  return Math.min(
    AUDIO_PRACTICE_MAX_BPM,
    Math.max(AUDIO_PRACTICE_MIN_BPM, Math.round(value)),
  )
}

/** Visible by default; extended meters scroll in horizontally. */
export const PRACTICE_CORE_METERS: MetronomeMeter[] = ['2/4', '4/4', '5/4', '6/8', '9/8', '12/8']

export const PRACTICE_EXTENDED_METERS: MetronomeMeter[] = [
  '3/4',
  '6/4',
  '7/4',
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

export interface PracticeRhythmOption {
  id: string
  value: MetronomeSubdivision
  label: string
  name: string
  ticksPerBeat: number
}

export const PRACTICE_CORE_RHYTHM_OPTIONS: PracticeRhythmOption[] = [
  { id: 'quarter', value: 'off', label: '♩', name: 'Quarter notes', ticksPerBeat: 1 },
  { id: 'eighth', value: '8ths', label: '♪', name: 'Eighth notes', ticksPerBeat: 2 },
  { id: 'triplet', value: 'triplets', label: '♪3', name: 'Triplets', ticksPerBeat: 3 },
  { id: 'sixteenth', value: '16ths', label: '♬', name: 'Sixteenth notes', ticksPerBeat: 4 },
]

export const PRACTICE_EXTENDED_RHYTHM_OPTIONS: PracticeRhythmOption[] = [
  { id: 'dotted', value: 'dotted', label: '♩·', name: 'Dotted quarter', ticksPerBeat: 3 },
  { id: 'quintuplet', value: 'quints', label: '5', name: 'Quintuplets', ticksPerBeat: 5 },
  { id: 'septuplet', value: 'septuplets', label: '7', name: 'Septuplets', ticksPerBeat: 7 },
]

/** UI-only until sound engine supports multiple click timbres. */
export const AUDIO_PRACTICE_CLICK_SOUNDS = [
  { id: 'classic', label: 'Classic' },
  { id: 'woodblock', label: 'Woodblock' },
  { id: 'soft', label: 'Soft' },
  { id: 'electronic', label: 'Electronic' },
] as const

export type AudioPracticeClickSoundId = (typeof AUDIO_PRACTICE_CLICK_SOUNDS)[number]['id']

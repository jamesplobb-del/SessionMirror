import type { MetronomeSubdivision } from '../../utils/metronomeConfig'

export const AUDIO_PRACTICE_MIN_BPM = 30
export const AUDIO_PRACTICE_MAX_BPM = 240
export const AUDIO_PRACTICE_DEFAULT_BPM = 120

export function clampAudioPracticeBpm(value: number): number {
  return Math.min(
    AUDIO_PRACTICE_MAX_BPM,
    Math.max(AUDIO_PRACTICE_MIN_BPM, Math.round(value)),
  )
}

export const AUDIO_PRACTICE_METERS = ['2/4', '3/4', '4/4', '5/4', '6/8'] as const

export const AUDIO_PRACTICE_SUBDIVISIONS: {
  value: MetronomeSubdivision
  label: string
}[] = [
  { value: 'off', label: 'Quarter' },
  { value: '8ths', label: 'Eighth' },
  { value: 'triplets', label: 'Triplet' },
  { value: '16ths', label: '16th' },
]

/** UI-only until sound engine supports multiple click timbres. */
export const AUDIO_PRACTICE_CLICK_SOUNDS = [
  { id: 'classic', label: 'Classic' },
  { id: 'woodblock', label: 'Woodblock' },
  { id: 'soft', label: 'Soft' },
  { id: 'electronic', label: 'Electronic' },
] as const

export type AudioPracticeClickSoundId = (typeof AUDIO_PRACTICE_CLICK_SOUNDS)[number]['id']

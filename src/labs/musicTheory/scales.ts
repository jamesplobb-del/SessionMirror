/** Scale definitions for Practice Arcade games. */

export type ScaleType = 'major' | 'minor'

export const SCALE_TYPE_LABELS: Record<ScaleType, string> = {
  major: 'Major',
  minor: 'Minor',
}

export const SCALE_INTERVALS: Record<ScaleType, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
}

export const KEY_ROOTS = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const

export type KeyRoot = (typeof KEY_ROOTS)[number]

const KEY_ROOT_TO_PITCH_CLASS: Record<KeyRoot, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11,
}

const FLAT_PITCH_CLASS_LABELS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const
const SHARP_PITCH_CLASS_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const FLAT_KEYS = new Set<KeyRoot>(['F', 'Bb', 'Eb', 'Ab'])

export function pitchClassLabel(pitchClass: number, key: KeyRoot): string {
  const normalized = ((pitchClass % 12) + 12) % 12
  return FLAT_KEYS.has(key) ? FLAT_PITCH_CLASS_LABELS[normalized] : SHARP_PITCH_CLASS_LABELS[normalized]
}

export function midiToTargetDisplay(midi: number, key: KeyRoot): string {
  const pitchClass = ((Math.round(midi) % 12) + 12) % 12
  return pitchClassLabel(pitchClass, key)
}

export function buildScaleMidiPool(
  key: KeyRoot,
  scaleType: ScaleType,
  minOctave = 2,
  maxOctave = 6,
): number[] {
  const rootPc = KEY_ROOT_TO_PITCH_CLASS[key]
  const intervals = SCALE_INTERVALS[scaleType]
  const notes: number[] = []

  for (let octave = minOctave; octave <= maxOctave; octave += 1) {
    for (const interval of intervals) {
      const pitchClass = (rootPc + interval) % 12
      const midi = (octave + 1) * 12 + pitchClass
      notes.push(midi)
    }
  }

  return [...new Set(notes)].sort((a, b) => a - b)
}

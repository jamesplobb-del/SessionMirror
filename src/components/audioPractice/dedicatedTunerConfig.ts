import type { TunerInstrument } from '../../utils/pitchConfig'

export type DedicatedTunerPresetId =
  | 'chromatic'
  | 'trumpet'
  | 'trombone'
  | 'horn'
  | 'tuba'
  | 'sax'
  | 'clarinet'
  | 'flute'
  | 'strings'

export interface DedicatedTunerPreset {
  id: DedicatedTunerPresetId
  label: string
  /** Maps to existing engine profile — no transposition in this phase. */
  engine: TunerInstrument
}

export const DEDICATED_TUNER_PRESETS: DedicatedTunerPreset[] = [
  { id: 'chromatic', label: 'Chromatic', engine: 'winds' },
  { id: 'trumpet', label: 'Trumpet', engine: 'winds' },
  { id: 'trombone', label: 'Trombone', engine: 'winds' },
  { id: 'horn', label: 'Horn', engine: 'winds' },
  { id: 'tuba', label: 'Tuba', engine: 'winds' },
  { id: 'sax', label: 'Sax', engine: 'winds' },
  { id: 'clarinet', label: 'Clarinet', engine: 'winds' },
  { id: 'flute', label: 'Flute', engine: 'winds' },
  { id: 'strings', label: 'Strings', engine: 'strings' },
]

export const REFERENCE_PITCH_OPTIONS = [440, 441, 442, 443] as const
export type ReferencePitchHz = (typeof REFERENCE_PITCH_OPTIONS)[number]

export function presetEngineInstrument(presetId: DedicatedTunerPresetId): TunerInstrument {
  return DEDICATED_TUNER_PRESETS.find((preset) => preset.id === presetId)?.engine ?? 'winds'
}

export type DedicatedTunerStatus = 'listening' | 'flat' | 'sharp' | 'in-tune'

export function getDedicatedTunerStatus(
  noteName: string,
  cents: number,
): DedicatedTunerStatus {
  if (noteName === '—') return 'listening'
  if (cents < -5) return 'flat'
  if (cents > 5) return 'sharp'
  return 'in-tune'
}

export function parseNoteDisplay(noteName: string): {
  pitchClass: string
  octave: string | null
} {
  if (noteName === '—' || !noteName) {
    return { pitchClass: '—', octave: null }
  }

  const match = noteName.match(/^([A-G](?:#|b)?)(\d+)$/)
  if (match) {
    return { pitchClass: match[1], octave: match[2] }
  }

  return { pitchClass: noteName, octave: null }
}

export function formatHeroCents(cents: number): string {
  if (!Number.isFinite(cents)) return '—'
  const rounded = Math.round(cents)
  const sign = rounded >= 0 ? '+' : ''
  return `${sign}${rounded}¢`
}

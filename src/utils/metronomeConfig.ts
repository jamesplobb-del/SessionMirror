export type MetronomeMeter =
  | '2/4'
  | '3/4'
  | '4/4'
  | '5/4'
  | '6/4'
  | '7/4'
  | '6/8'
  | '9/8'
  | '12/8'
  | '5/8'
  | '7/8'
  | '8/8'
  | '10/8'
  | '11/8'
  | '3/16'
  | '5/16'
  | '7/16'
  | '9/16'
  | '11/16'
  | '13/16'
  | '15/16'
  | '16/16'

export type MetronomeMeterGroup = 'simple' | 'compound' | 'odd' | 'sixteenth'

export interface MetronomeMeterDef {
  label: string
  numerator: number
  denominator: number
  /** Main beat dots shown in the UI. */
  beatsPerBar: number
  group: MetronomeMeterGroup
  /** Compound 8th-note pulses per bar when subdivision is quarter (off). */
  eighthNotesPerBar?: number
}

export const METRONOME_METERS: Record<MetronomeMeter, MetronomeMeterDef> = {
  '2/4': { label: '2/4', numerator: 2, denominator: 4, beatsPerBar: 2, group: 'simple' },
  '3/4': { label: '3/4', numerator: 3, denominator: 4, beatsPerBar: 3, group: 'simple' },
  '4/4': { label: '4/4', numerator: 4, denominator: 4, beatsPerBar: 4, group: 'simple' },
  '5/4': { label: '5/4', numerator: 5, denominator: 4, beatsPerBar: 5, group: 'simple' },
  '6/4': { label: '6/4', numerator: 6, denominator: 4, beatsPerBar: 6, group: 'simple' },
  '7/4': { label: '7/4', numerator: 7, denominator: 4, beatsPerBar: 7, group: 'simple' },
  '6/8': {
    label: '6/8',
    numerator: 6,
    denominator: 8,
    beatsPerBar: 2,
    group: 'compound',
    eighthNotesPerBar: 6,
  },
  '9/8': {
    label: '9/8',
    numerator: 9,
    denominator: 8,
    beatsPerBar: 3,
    group: 'compound',
    eighthNotesPerBar: 9,
  },
  '12/8': {
    label: '12/8',
    numerator: 12,
    denominator: 8,
    beatsPerBar: 4,
    group: 'compound',
    eighthNotesPerBar: 12,
  },
  '5/8': { label: '5/8', numerator: 5, denominator: 8, beatsPerBar: 5, group: 'odd' },
  '7/8': { label: '7/8', numerator: 7, denominator: 8, beatsPerBar: 7, group: 'odd' },
  '8/8': { label: '8/8', numerator: 8, denominator: 8, beatsPerBar: 8, group: 'odd' },
  '10/8': { label: '10/8', numerator: 10, denominator: 8, beatsPerBar: 10, group: 'odd' },
  '11/8': { label: '11/8', numerator: 11, denominator: 8, beatsPerBar: 11, group: 'odd' },
  '3/16': { label: '3/16', numerator: 3, denominator: 16, beatsPerBar: 3, group: 'sixteenth' },
  '5/16': { label: '5/16', numerator: 5, denominator: 16, beatsPerBar: 5, group: 'sixteenth' },
  '7/16': { label: '7/16', numerator: 7, denominator: 16, beatsPerBar: 7, group: 'sixteenth' },
  '9/16': { label: '9/16', numerator: 9, denominator: 16, beatsPerBar: 9, group: 'sixteenth' },
  '11/16': { label: '11/16', numerator: 11, denominator: 16, beatsPerBar: 11, group: 'sixteenth' },
  '13/16': { label: '13/16', numerator: 13, denominator: 16, beatsPerBar: 13, group: 'sixteenth' },
  '15/16': { label: '15/16', numerator: 15, denominator: 16, beatsPerBar: 15, group: 'sixteenth' },
  '16/16': { label: '16/16', numerator: 16, denominator: 16, beatsPerBar: 16, group: 'sixteenth' },
}

export const SIMPLE_METERS: MetronomeMeter[] = ['2/4', '3/4', '4/4']
export const COMPOUND_METERS: MetronomeMeter[] = ['6/8', '9/8', '12/8']
export const AUDIO_STAGE_METERS: MetronomeMeter[] = ['2/4', '3/4', '4/4', '5/4', '6/8']

export const MIN_BPM = 1
export const MAX_BPM = 400
export const DEFAULT_BPM = 120
export const DEFAULT_METER: MetronomeMeter = '4/4'
export const DEFAULT_SUBDIVISION: MetronomeSubdivision = 'off'

export type MetronomeSubdivision =
  | 'off'
  | '8ths'
  | 'triplets'
  | '16ths'
  | 'dotted'
  | 'quints'
  | 'septuplets'

export const METRONOME_SUBDIVISIONS: { value: MetronomeSubdivision; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: '8ths', label: '8ths' },
  { value: 'triplets', label: 'Triplets' },
  { value: '16ths', label: '16ths' },
]

export const STAGE_SUBDIVISIONS: { value: MetronomeSubdivision; label: string }[] = [
  { value: 'off', label: 'Quarter Notes' },
  { value: '8ths', label: 'Eighth Notes' },
  { value: 'triplets', label: 'Triplets' },
  { value: '16ths', label: 'Sixteenth Notes' },
]

export const AUDIO_STAGE_METRONOME_SOUNDS = [{ id: 'classic', label: 'Classic' }] as const

const STORAGE_KEY = 'sessionmirror:metronome-prefs'

export interface MetronomePrefs {
  bpm: number
  meter: MetronomeMeter
  subdivision: MetronomeSubdivision
  accentFirstBeat: boolean
  soundId: string
}

const DEFAULT_SOUND_ID = 'classic'

const VALID_SUBDIVISIONS = new Set<MetronomeSubdivision>([
  'off',
  '8ths',
  'triplets',
  '16ths',
  'dotted',
  'quints',
  'septuplets',
])

function defaultMetronomePrefs(): MetronomePrefs {
  return {
    bpm: DEFAULT_BPM,
    meter: DEFAULT_METER,
    subdivision: DEFAULT_SUBDIVISION,
    accentFirstBeat: true,
    soundId: DEFAULT_SOUND_ID,
  }
}

export function clampBpm(value: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)))
}

function parseMeter(value: unknown): MetronomeMeter {
  if (typeof value === 'string' && value in METRONOME_METERS) {
    return value as MetronomeMeter
  }
  return DEFAULT_METER
}

function parseSubdivision(value: unknown): MetronomeSubdivision {
  if (typeof value === 'string' && VALID_SUBDIVISIONS.has(value as MetronomeSubdivision)) {
    return value as MetronomeSubdivision
  }
  return DEFAULT_SUBDIVISION
}

export function subdivisionsPerBeat(subdivision: MetronomeSubdivision): number {
  switch (subdivision) {
    case '8ths':
      return 2
    case 'triplets':
    case 'dotted':
      return 3
    case '16ths':
      return 4
    case 'quints':
      return 5
    case 'septuplets':
      return 7
    default:
      return 1
  }
}

export function loadMetronomePrefs(): MetronomePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaultMetronomePrefs()
    }
    const parsed = JSON.parse(raw) as Partial<MetronomePrefs>
    return {
      bpm: clampBpm(Number(parsed.bpm) || DEFAULT_BPM),
      meter: parseMeter(parsed.meter),
      subdivision: parseSubdivision(parsed.subdivision),
      accentFirstBeat: parsed.accentFirstBeat !== false,
      soundId:
        typeof parsed.soundId === 'string' && parsed.soundId.length > 0
          ? parsed.soundId
          : DEFAULT_SOUND_ID,
    }
  } catch {
    return defaultMetronomePrefs()
  }
}

export function saveMetronomePrefs(prefs: MetronomePrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        bpm: clampBpm(prefs.bpm),
        meter: prefs.meter,
        subdivision: prefs.subdivision,
        accentFirstBeat: prefs.accentFirstBeat,
        soundId: prefs.soundId,
      }),
    )
  } catch {
    /* private mode / quota */
  }
}

export function getMeterDef(meter: MetronomeMeter): MetronomeMeterDef {
  return METRONOME_METERS[meter]
}

export function getBeatsPerBar(meter: MetronomeMeter): number {
  return METRONOME_METERS[meter].beatsPerBar
}

export function isCompoundMeter(meter: MetronomeMeter): boolean {
  return METRONOME_METERS[meter].group === 'compound'
}

export function getEighthNotesPerBar(meter: MetronomeMeter): number {
  const def = METRONOME_METERS[meter]
  return def.eighthNotesPerBar ?? def.beatsPerBar
}

export function getCompoundGroupSize(_meter: MetronomeMeter): number {
  return 3
}

export type MetronomeClickTier = 'downbeat' | 'macro' | 'subdivision'

/** Compound 8th-note accent: 1 = downbeat, 4/7/10… = macro pulse, others = fill. */
export function getCompoundClickTier(eighthIndexInBar: number): MetronomeClickTier {
  if (eighthIndexInBar === 0) return 'downbeat'
  if (eighthIndexInBar % 3 === 0) return 'macro'
  return 'subdivision'
}

export function getSimpleClickTier(beatIndexInBar: number): MetronomeClickTier {
  return beatIndexInBar === 0 ? 'downbeat' : 'subdivision'
}

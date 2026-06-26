export type MetronomeMeter = '2/4' | '3/4' | '4/4' | '5/4' | '6/8' | '9/8' | '12/8'

export interface MetronomeMeterDef {
  label: string
  beatsPerBar: number
  group: 'simple' | 'compound'
  /** Eighth-note subdivisions per bar (compound meters only). */
  eighthNotesPerBar?: number
}

export const METRONOME_METERS: Record<MetronomeMeter, MetronomeMeterDef> = {
  '2/4': { label: '2/4', beatsPerBar: 2, group: 'simple' },
  '3/4': { label: '3/4', beatsPerBar: 3, group: 'simple' },
  '4/4': { label: '4/4', beatsPerBar: 4, group: 'simple' },
  '5/4': { label: '5/4', beatsPerBar: 5, group: 'simple' },
  '6/8': { label: '6/8', beatsPerBar: 2, group: 'compound', eighthNotesPerBar: 6 },
  '9/8': { label: '9/8', beatsPerBar: 3, group: 'compound', eighthNotesPerBar: 9 },
  '12/8': { label: '12/8', beatsPerBar: 4, group: 'compound', eighthNotesPerBar: 12 },
}

export const SIMPLE_METERS: MetronomeMeter[] = ['2/4', '3/4', '4/4']
export const COMPOUND_METERS: MetronomeMeter[] = ['6/8', '9/8', '12/8']
export const AUDIO_STAGE_METERS: MetronomeMeter[] = ['2/4', '3/4', '4/4', '5/4', '6/8']

export const MIN_BPM = 1
export const MAX_BPM = 400
export const DEFAULT_BPM = 120
export const DEFAULT_METER: MetronomeMeter = '4/4'
export const DEFAULT_SUBDIVISION: MetronomeSubdivision = 'off'

export type MetronomeSubdivision = 'off' | '8ths' | 'triplets' | '16ths'

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
  if (value === '8ths' || value === 'triplets' || value === '16ths' || value === 'off') {
    return value
  }
  return DEFAULT_SUBDIVISION
}

export function subdivisionsPerBeat(subdivision: MetronomeSubdivision): number {
  switch (subdivision) {
    case '8ths':
      return 2
    case 'triplets':
      return 3
    case '16ths':
      return 4
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

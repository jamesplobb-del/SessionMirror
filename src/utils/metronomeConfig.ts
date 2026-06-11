export type MetronomeMeter = '2/4' | '3/4' | '4/4' | '6/8' | '9/8' | '12/8'

export interface MetronomeMeterDef {
  label: string
  beatsPerBar: number
  group: 'simple' | 'compound'
}

export const METRONOME_METERS: Record<MetronomeMeter, MetronomeMeterDef> = {
  '2/4': { label: '2/4', beatsPerBar: 2, group: 'simple' },
  '3/4': { label: '3/4', beatsPerBar: 3, group: 'simple' },
  '4/4': { label: '4/4', beatsPerBar: 4, group: 'simple' },
  '6/8': { label: '6/8', beatsPerBar: 2, group: 'compound' },
  '9/8': { label: '9/8', beatsPerBar: 3, group: 'compound' },
  '12/8': { label: '12/8', beatsPerBar: 4, group: 'compound' },
}

export const SIMPLE_METERS: MetronomeMeter[] = ['2/4', '3/4', '4/4']
export const COMPOUND_METERS: MetronomeMeter[] = ['6/8', '9/8', '12/8']

export const MIN_BPM = 1
export const MAX_BPM = 400
export const DEFAULT_BPM = 120
export const DEFAULT_METER: MetronomeMeter = '4/4'

const STORAGE_KEY = 'sessionmirror:metronome-prefs'

export interface MetronomePrefs {
  bpm: number
  meter: MetronomeMeter
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

export function loadMetronomePrefs(): MetronomePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { bpm: DEFAULT_BPM, meter: DEFAULT_METER }
    const parsed = JSON.parse(raw) as Partial<MetronomePrefs>
    return {
      bpm: clampBpm(Number(parsed.bpm) || DEFAULT_BPM),
      meter: parseMeter(parsed.meter),
    }
  } catch {
    return { bpm: DEFAULT_BPM, meter: DEFAULT_METER }
  }
}

export function saveMetronomePrefs(prefs: MetronomePrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ bpm: clampBpm(prefs.bpm), meter: prefs.meter }),
    )
  } catch {
    /* private mode / quota */
  }
}

export function getBeatsPerBar(meter: MetronomeMeter): number {
  return METRONOME_METERS[meter].beatsPerBar
}

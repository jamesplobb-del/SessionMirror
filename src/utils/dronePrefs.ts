import type { DroneWaveform } from './droneEngine'

export interface DronePrefs {
  activeNotes: number[]
  octave: number
  enabled: boolean
  volume: number
  waveform: DroneWaveform
}

export const DEFAULT_DRONE_PREFS: DronePrefs = {
  activeNotes: [],
  octave: 4,
  enabled: false,
  volume: 0.75,
  waveform: 'sine',
}

const STORAGE_KEY = 'sessionmirror:drone-prefs'

function clampOctave(value: number): number {
  return Math.min(8, Math.max(0, Math.round(value)))
}

function parseWaveform(value: unknown): DroneWaveform {
  if (value === 'triangle' || value === 'organ' || value === 'warmSynth') return value
  return 'sine'
}

export function loadDronePrefs(): DronePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_DRONE_PREFS }

    const parsed = JSON.parse(raw) as Partial<DronePrefs>
    return {
      activeNotes: [],
      octave: clampOctave(Number(parsed.octave) || DEFAULT_DRONE_PREFS.octave),
      enabled: false,
      volume:
        parsed.volume === undefined
          ? DEFAULT_DRONE_PREFS.volume
          : Math.min(1, Math.max(0, Number(parsed.volume) || DEFAULT_DRONE_PREFS.volume)),
      waveform: parseWaveform(parsed.waveform),
    }
  } catch {
    return { ...DEFAULT_DRONE_PREFS }
  }
}

export function saveDronePrefs(prefs: DronePrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...prefs,
        activeNotes: [],
        enabled: false,
      }),
    )
  } catch {
    /* private mode / quota */
  }
}

import type { DroneWaveform } from './droneEngine'

export interface DronePrefs {
  activeNotes: number[]
  octave: number
  enabled: boolean
  volume: number
  waveform: DroneWaveform
  /**
   * The last pitch class the player held. Sound never restores on its own
   * across a relaunch, but the desk drone widget reopens on this note so one
   * tap brings yesterday's drone back.
   */
  lastPitchClass: number | null
}

export const DEFAULT_DRONE_PREFS: DronePrefs = {
  activeNotes: [],
  octave: 4,
  enabled: false,
  volume: 0.75,
  waveform: 'warmSynth',
  lastPitchClass: null,
}

const STORAGE_KEY = 'sessionmirror:drone-prefs'

function clampOctave(value: number): number {
  return Math.min(8, Math.max(0, Math.round(value)))
}

function parseWaveform(value: unknown): DroneWaveform {
  if (value === 'triangle' || value === 'organ' || value === 'warmSynth') return value
  return DEFAULT_DRONE_PREFS.waveform
}

function parsePitchClass(value: unknown): number | null {
  const pitchClass = Number(value)
  return Number.isInteger(pitchClass) && pitchClass >= 0 && pitchClass <= 11 ? pitchClass : null
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
      lastPitchClass: parsePitchClass(parsed.lastPitchClass),
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
        lastPitchClass: prefs.activeNotes[0] ?? prefs.lastPitchClass,
      }),
    )
  } catch {
    /* private mode / quota */
  }
}

/**
 * Staff Jumper setup that should survive leaving the game.
 *
 * Instrument is stored separately (shared with Balance and Learn). Everything
 * else used to reset the moment the screen unmounted, which made a carefully
 * built hard-mode 6/8 session feel like a temporary draft.
 */
import type { StaffJumperClef } from './staffNotationMap'
import type { StaffJumperTransposition } from './staffJumperInstrumentRanges'
import {
  STAFF_JUMPER_DIFFICULTIES,
  STAFF_JUMPER_MAJOR_KEYS,
  STAFF_JUMPER_MINOR_KEYS,
  STAFF_JUMPER_RANGES,
  type StaffJumperDifficulty,
  type StaffJumperKey,
  type StaffJumperRange,
  type StaffJumperScaleMode,
} from './staffJumperMusicLogic'
import {
  STAFF_JUMPER_METERS,
  STAFF_JUMPER_TEMPO_DEFAULT,
  STAFF_JUMPER_TEMPO_MAX,
  STAFF_JUMPER_TEMPO_MIN,
  type StaffJumperMeter,
} from './staffJumperRhythm'

const STORAGE_KEY = 'sessionmirror:staff-jumper-setup'
const VERSION = 1

export interface StaffJumperSetupPrefs {
  scaleMode: StaffJumperScaleMode
  key: StaffJumperKey
  range: StaffJumperRange
  difficulty: StaffJumperDifficulty
  meter: StaffJumperMeter
  tempoBpm: number
  metronome: boolean
  drone: boolean
  lives: boolean
  customEnabled: boolean
  customNotes: number[]
  /** Kept when the player is on Other / custom, not a named instrument. */
  clef?: StaffJumperClef
  transposition?: StaffJumperTransposition
  instrumentId: string | null
}

const DEFAULTS: StaffJumperSetupPrefs = {
  scaleMode: 'major',
  key: 'C',
  range: '1-octave',
  difficulty: 'easy',
  meter: 'simple',
  tempoBpm: STAFF_JUMPER_TEMPO_DEFAULT,
  metronome: true,
  drone: false,
  lives: false,
  customEnabled: false,
  customNotes: [0, 2, 4, 7, 9],
  instrumentId: null,
}

function isKey(value: unknown, scaleMode: StaffJumperScaleMode): value is StaffJumperKey {
  const keys = scaleMode === 'major' ? STAFF_JUMPER_MAJOR_KEYS : STAFF_JUMPER_MINOR_KEYS
  return typeof value === 'string' && (keys as readonly string[]).includes(value)
}

export function loadStaffJumperSetupPrefs(): StaffJumperSetupPrefs | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StaffJumperSetupPrefs> & { version?: number }
    if (parsed.version !== VERSION) return null
    const scaleMode: StaffJumperScaleMode = parsed.scaleMode === 'minor' ? 'minor' : 'major'
    const key = isKey(parsed.key, scaleMode) ? parsed.key : DEFAULTS.key
    const range = STAFF_JUMPER_RANGES.includes(parsed.range as StaffJumperRange)
      ? (parsed.range as StaffJumperRange)
      : DEFAULTS.range
    const difficulty = STAFF_JUMPER_DIFFICULTIES.includes(parsed.difficulty as StaffJumperDifficulty)
      ? (parsed.difficulty as StaffJumperDifficulty)
      : DEFAULTS.difficulty
    const meter = STAFF_JUMPER_METERS.includes(parsed.meter as StaffJumperMeter)
      ? (parsed.meter as StaffJumperMeter)
      : DEFAULTS.meter
    const tempo = Number(parsed.tempoBpm)
    const customNotes = Array.isArray(parsed.customNotes)
      ? parsed.customNotes.filter((note): note is number => Number.isInteger(note) && note >= 0 && note < 12)
      : DEFAULTS.customNotes
    return {
      scaleMode,
      key,
      range,
      difficulty,
      meter,
      tempoBpm:
        Number.isFinite(tempo)
          ? Math.min(STAFF_JUMPER_TEMPO_MAX, Math.max(STAFF_JUMPER_TEMPO_MIN, Math.round(tempo)))
          : DEFAULTS.tempoBpm,
      metronome: parsed.metronome !== false,
      drone: parsed.drone === true,
      lives: parsed.lives === true,
      customEnabled: parsed.customEnabled === true && customNotes.length >= 2,
      customNotes: customNotes.length >= 2 ? customNotes : DEFAULTS.customNotes,
      clef: parsed.clef === 'bass' || parsed.clef === 'alto' || parsed.clef === 'treble' ? parsed.clef : undefined,
      transposition:
        parsed.transposition === 'concert' ||
        parsed.transposition === 'bb' ||
        parsed.transposition === 'eb' ||
        parsed.transposition === 'f' ||
        parsed.transposition === 'a' ||
        parsed.transposition === 'g'
          ? parsed.transposition
          : undefined,
      instrumentId: typeof parsed.instrumentId === 'string' ? parsed.instrumentId : parsed.instrumentId === null ? null : DEFAULTS.instrumentId,
    }
  } catch {
    return null
  }
}

export function saveStaffJumperSetupPrefs(prefs: StaffJumperSetupPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...prefs }))
  } catch {
    // Private browsing; the session still holds the draft.
  }
}

/**
 * One instrument pick for every practice game.
 *
 * Balance, Staff Jumper and Learn Your Instrument already know how to set
 * themselves up from a saved horn — they just stored it in three places.
 * The Games lobby writes all three, so a trumpeter is a trumpeter in every
 * game without saying it again.
 *
 * Canonical ids are Balance's, which is the superset of Staff Jumper's table
 * plus Concert Pitch and viola. Learn has a shorter beginner's list, so a
 * pick it does not teach (oboe, violin, concert pitch) is left alone there.
 */
import {
  BALANCE_INSTRUMENTS,
  getBalanceInstrument,
  resolveBalanceInstrumentId,
} from './balance/balanceInstruments'
import { clampWrittenMidi } from './balance/balanceMusic'
import { loadBalanceData, saveBalanceData } from './balance/balanceStorage'
import {
  getStaffJumperInstrument,
  saveStaffJumperInstrumentId,
} from './staffJumper/staffJumperInstruments'

const INSTRUMENT_STORAGE_KEY = 'besttake.practiceGames.instrument'
const LAST_GAME_STORAGE_KEY = 'besttake.practiceGames.lastGame'

/**
 * Learn Your Instrument's own saved pick, patched raw.
 *
 * Importing its hook would pull the whole lesson dataset into the lobby
 * bundle for one string. The key is duplicated instead — it is versioned,
 * and a miss just means Learn keeps whatever it had.
 * Source: `LESSON_STORAGE_KEY` in labs/learnInstrument/useLearnInstrumentGame.
 */
const LESSON_STORAGE_KEY = 'session-mirror.learn-instrument.v1'

/** Learn's ids → canonical (Staff Jumper / Balance) ids. */
const FROM_LESSON: Record<string, string> = {
  flute: 'flute',
  'bb-clarinet': 'clarinet',
  'alto-sax': 'alto-sax',
  'tenor-sax': 'tenor-sax',
  'bb-trumpet': 'trumpet',
  'french-horn': 'french-horn',
  trombone: 'trombone',
  baritone: 'euphonium',
  tuba: 'tuba',
  'soprano-recorder': 'recorder',
}

/** Canonical ids → Learn's ids, for the instruments that game actually teaches. */
const TO_LESSON: Record<string, string> = {
  flute: 'flute',
  clarinet: 'bb-clarinet',
  'alto-sax': 'alto-sax',
  'tenor-sax': 'tenor-sax',
  trumpet: 'bb-trumpet',
  'french-horn': 'french-horn',
  trombone: 'trombone',
  euphonium: 'baritone',
  tuba: 'tuba',
  recorder: 'soprano-recorder',
}

export type PracticeGameId = 'staff-jumper' | 'balance' | 'learn-instrument'

function isPracticeGameId(value: unknown): value is PracticeGameId {
  return value === 'staff-jumper' || value === 'balance' || value === 'learn-instrument'
}

export function isPracticeGameInstrumentId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  const resolved = resolveBalanceInstrumentId(value)
  return BALANCE_INSTRUMENTS.some((instrument) => instrument.id === resolved)
}

function readSharedInstrumentId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(INSTRUMENT_STORAGE_KEY)
    return isPracticeGameInstrumentId(value) ? resolveBalanceInstrumentId(value) : null
  } catch {
    return null
  }
}

function readStaffJumperInstrumentId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem('sessionmirror:staff-jumper-instrument')
    return isPracticeGameInstrumentId(value) ? resolveBalanceInstrumentId(value) : null
  } catch {
    return null
  }
}

function readBalanceInstrumentId(): string | null {
  const stored = loadBalanceData('concert').settings.instrumentId
  return isPracticeGameInstrumentId(stored) ? resolveBalanceInstrumentId(stored) : null
}

function readLessonInstrumentId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LESSON_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { selectedInstrumentId?: unknown }
    const lessonId =
      typeof parsed.selectedInstrumentId === 'string' ? parsed.selectedInstrumentId : null
    const canonical = lessonId ? FROM_LESSON[lessonId] : null
    return canonical && isPracticeGameInstrumentId(canonical) ? canonical : null
  } catch {
    return null
  }
}

function patchLearnInstrumentId(canonicalId: string): void {
  const lessonId = TO_LESSON[canonicalId]
  if (!lessonId || typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(LESSON_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    window.localStorage.setItem(
      LESSON_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        selectedInstrumentId: lessonId,
        selectedGoalId:
          typeof parsed.selectedGoalId === 'string' ? parsed.selectedGoalId : 'first-notes',
        completedLessonIdsByInstrument:
          parsed.completedLessonIdsByInstrument &&
          typeof parsed.completedLessonIdsByInstrument === 'object'
            ? parsed.completedLessonIdsByInstrument
            : {},
      }),
    )
  } catch {
    // Private browsing; the session still holds the lobby selection.
  }
}

function patchBalanceInstrumentId(canonicalId: string): void {
  const instrument = getBalanceInstrument(canonicalId)
  const data = loadBalanceData(instrument.id)
  const octaveRange = data.settings.scale.octaveRange === 2 ? 2 : 1
  saveBalanceData({
    ...data,
    settings: {
      ...data.settings,
      instrumentId: instrument.id,
      single: {
        ...data.settings.single,
        writtenMidi: clampWrittenMidi(data.settings.single.writtenMidi, instrument),
      },
      scale: {
        ...data.settings.scale,
        rootWrittenMidi: Math.min(
          clampWrittenMidi(data.settings.scale.rootWrittenMidi, instrument),
          instrument.maxWrittenMidi - octaveRange * 12,
        ),
      },
    },
  })
}

/**
 * Shared pick first, then whatever each game already knew. A player who has
 * told Staff Jumper or Learn what they play should not have to say it again
 * the first time they open the new lobby.
 */
export function loadPracticeGameInstrumentId(): string | null {
  return (
    readSharedInstrumentId() ??
    readStaffJumperInstrumentId() ??
    readBalanceInstrumentId() ??
    readLessonInstrumentId()
  )
}

/**
 * Remember the horn and push it into every game that can use it.
 *
 * Staff Jumper has no Concert Pitch / viola rows, so those clear its preset
 * and leave the player on a custom setup. Learn only receives instruments it
 * actually teaches.
 */
export function savePracticeGameInstrumentId(id: string): void {
  if (!isPracticeGameInstrumentId(id)) return
  const canonicalId = getBalanceInstrument(id).id
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, canonicalId)
    } catch {
      // Session state still holds.
    }
  }
  saveStaffJumperInstrumentId(getStaffJumperInstrument(canonicalId)?.id ?? null)
  patchBalanceInstrumentId(canonicalId)
  patchLearnInstrumentId(canonicalId)
}

export function loadLastPracticeGame(): PracticeGameId | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(LAST_GAME_STORAGE_KEY)
    return isPracticeGameId(value) ? value : null
  } catch {
    return null
  }
}

export function saveLastPracticeGame(id: PracticeGameId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_GAME_STORAGE_KEY, id)
  } catch {
    // Session navigation still holds.
  }
}

/** Canonical id Learn uses internally, or null when that game does not teach it. */
export function lessonInstrumentIdFor(canonicalId: string): string | null {
  return TO_LESSON[canonicalId] ?? null
}

/** Canonical id for a Learn pick, or null when Learn is using an unknown id. */
export function canonicalInstrumentIdFromLesson(lessonId: string): string | null {
  const canonical = FROM_LESSON[lessonId]
  return canonical && isPracticeGameInstrumentId(canonical) ? canonical : null
}

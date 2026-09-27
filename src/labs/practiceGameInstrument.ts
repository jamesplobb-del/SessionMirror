/**
 * One instrument pick for every practice game.
 *
 * Balance, Staff Jumper and Learn Your Instrument already know how to set
 * themselves up from a saved horn — they just stored it in three places.
 * The Games lobby writes all three, so a trumpeter is a trumpeter in every
 * game without saying it again.
 *
 * The instrument named at the start, and on Home, feeds that same pick. Left
 * to themselves the games guess from the tuner's written pitch, which makes a
 * flute or a tuba a trombone, a clarinet a trumpet and a cello a violin — so
 * players started on the wrong horn. See `syncPracticeGamesWithHomeInstrument`.
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
import type { TunerInstrument } from '../utils/pitchConfig'

const INSTRUMENT_STORAGE_KEY = 'besttake.practiceGames.instrument'
const LAST_GAME_STORAGE_KEY = 'besttake.practiceGames.lastGame'

/**
 * The Home instrument the games were last set up from — how a horn picked
 * inside a game is told apart from one that Home has since replaced.
 */
const HOME_INSTRUMENT_STORAGE_KEY = 'besttake.practiceGames.homeInstrument'

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
  // Learn's one baritone row is taught from bass clef, but it is the same horn.
  'euphonium-treble': 'baritone',
  tuba: 'tuba',
  recorder: 'soprano-recorder',
}

/**
 * Home's instrument ids → canonical ids.
 *
 * Most are the same string. The exceptions are rows Home folds together:
 * voice and keys each have a treble and a bass row here, and "Something else"
 * is the games' neutral Concert Pitch. Home's euphonium stays the bass-clef
 * concert part. Treble-clef B♭ remains a separate row inside the games.
 */
const FROM_HOME: Record<string, string> = {
  voice: 'voice-treble',
  piano: 'piano-treble',
  other: 'concert',
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

/** Canonical id for a Home instrument, or null for an id the games do not know. */
export function practiceGameInstrumentIdForHome(homeInstrumentId: string): string | null {
  const id = FROM_HOME[homeInstrumentId] ?? homeInstrumentId
  return isPracticeGameInstrumentId(id) ? resolveBalanceInstrumentId(id) : null
}

function readHomeInstrumentMarker(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(HOME_INSTRUMENT_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeHomeInstrumentMarker(homeInstrumentId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HOME_INSTRUMENT_STORAGE_KEY, homeInstrumentId)
  } catch {
    // Without the marker the next open simply syncs again.
  }
}

/**
 * Point every game at the Home instrument — once per Home instrument.
 *
 * A player who names their horn at the start should find every game already
 * on it, including games first set up from the old guess. A horn picked
 * inside a game is the player's own choice, though — trying a friend's tuba
 * should not be undone every time Games opens — so it is replaced only when
 * Home names a *different* instrument, which is what the marker records.
 */
export function syncPracticeGamesWithHomeInstrument(homeInstrumentId: string | null): void {
  if (!homeInstrumentId || readHomeInstrumentMarker() === homeInstrumentId) return
  const gameId = practiceGameInstrumentIdForHome(homeInstrumentId)
  if (!gameId) return
  savePracticeGameInstrumentId(gameId)
  writeHomeInstrumentMarker(homeInstrumentId)
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

/**
 * Push Learn's pick out to the other games.
 *
 * Learn's one baritone row stands for both euphonium rows, so when the shared
 * pick is already that horn it is kept: starting a baritone lesson must not
 * move a treble-clef reader's other games to bass clef.
 */
export function savePracticeGameInstrumentFromLesson(lessonId: string): void {
  const canonicalId = canonicalInstrumentIdFromLesson(lessonId)
  if (!canonicalId) return
  const shared = readSharedInstrumentId()
  if (shared && TO_LESSON[shared] === lessonId) return
  savePracticeGameInstrumentId(canonicalId)
}

/**
 * Pitch-detection profile for a game instrument, or `fallback` when the player
 * has gone custom. Balance's table carries one per horn; a tuba heard through
 * the voice profile, whose floor is 65 Hz, never registers its low B♭.
 */
export function practiceGameTunerInstrument(
  gameInstrumentId: string | null | undefined,
  fallback: TunerInstrument,
): TunerInstrument {
  if (!gameInstrumentId || !isPracticeGameInstrumentId(gameInstrumentId)) return fallback
  return getBalanceInstrument(gameInstrumentId).tunerInstrument
}

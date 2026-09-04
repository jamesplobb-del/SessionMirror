/**
 * The instrument the practice games are played on.
 *
 * Both games already needed this fact, and each used to ask for it in its own
 * way — Staff Jumper had a "Written pitch" dropdown buried in its setup sheet,
 * Balance had an instrument list inside its own setup. It is really one
 * decision the player makes once, so it now lives on the Games menu and both
 * games read it from here.
 *
 * The choice is stored two ways on purpose: the id records what the player
 * actually picked (a trumpet and a Bb clarinet are the same transposition but
 * not the same word), while the tuner settings it maps to are written back to
 * the app so the tuner, Balance and Staff Jumper all agree.
 */
import type { TunerInstrument } from '../utils/pitchConfig'
import type { TunerTranspositionId } from '../utils/tunerTransposition'
import type { StaffJumperTransposition } from './staffJumper/staffJumperInstrumentRanges'
import type { StaffJumperClef } from './staffJumper/staffNotationMap'

export type PracticeGameInstrumentFamily = 'voice' | 'woodwind' | 'brass' | 'strings' | 'keys'

export const PRACTICE_GAME_FAMILY_LABELS: Record<PracticeGameInstrumentFamily, string> = {
  voice: 'Voice',
  woodwind: 'Woodwind',
  brass: 'Brass',
  strings: 'Strings',
  keys: 'Keys & fretboard',
}

/** Order the families are offered in — most common on a phone first. */
export const PRACTICE_GAME_FAMILY_ORDER: readonly PracticeGameInstrumentFamily[] = [
  'brass',
  'woodwind',
  'strings',
  'voice',
  'keys',
]

export interface PracticeGameInstrument {
  id: string
  name: string
  /** Written key, printed big on the menu: this is what changes on the staff. */
  keyLabel: string
  family: PracticeGameInstrumentFamily
  /** App-wide tuner transposition this instrument implies. */
  transposition: TunerTranspositionId
  /** Pitch-detection profile the tuner should use. */
  tunerInstrument: TunerInstrument
  /** Clef the instrument normally reads — the games' starting clef. */
  clef: StaffJumperClef
}

export const PRACTICE_GAME_INSTRUMENTS: readonly PracticeGameInstrument[] = [
  { id: 'trumpet', name: 'Trumpet', keyLabel: 'B♭', family: 'brass', transposition: 'bb', tunerInstrument: 'winds', clef: 'treble' },
  { id: 'horn', name: 'French horn', keyLabel: 'F', family: 'brass', transposition: 'f', tunerInstrument: 'winds', clef: 'treble' },
  { id: 'trombone', name: 'Trombone', keyLabel: 'C', family: 'brass', transposition: 'concert', tunerInstrument: 'winds', clef: 'bass' },
  { id: 'euphonium', name: 'Euphonium', keyLabel: 'C', family: 'brass', transposition: 'concert', tunerInstrument: 'winds', clef: 'bass' },
  { id: 'tuba', name: 'Tuba', keyLabel: 'C', family: 'brass', transposition: 'concert', tunerInstrument: 'winds', clef: 'bass' },

  { id: 'flute', name: 'Flute', keyLabel: 'C', family: 'woodwind', transposition: 'concert', tunerInstrument: 'winds', clef: 'treble' },
  { id: 'clarinet', name: 'Clarinet', keyLabel: 'B♭', family: 'woodwind', transposition: 'bb', tunerInstrument: 'winds', clef: 'treble' },
  { id: 'alto-sax', name: 'Alto sax', keyLabel: 'E♭', family: 'woodwind', transposition: 'eb', tunerInstrument: 'winds', clef: 'treble' },
  { id: 'tenor-sax', name: 'Tenor sax', keyLabel: 'B♭', family: 'woodwind', transposition: 'bb_octave', tunerInstrument: 'winds', clef: 'treble' },
  { id: 'bari-sax', name: 'Bari sax', keyLabel: 'E♭', family: 'woodwind', transposition: 'eb_octave', tunerInstrument: 'winds', clef: 'treble' },
  { id: 'oboe', name: 'Oboe', keyLabel: 'C', family: 'woodwind', transposition: 'concert', tunerInstrument: 'winds', clef: 'treble' },
  { id: 'bassoon', name: 'Bassoon', keyLabel: 'C', family: 'woodwind', transposition: 'concert', tunerInstrument: 'winds', clef: 'bass' },

  { id: 'violin', name: 'Violin', keyLabel: 'C', family: 'strings', transposition: 'concert', tunerInstrument: 'strings', clef: 'treble' },
  { id: 'cello', name: 'Cello', keyLabel: 'C', family: 'strings', transposition: 'concert', tunerInstrument: 'strings', clef: 'bass' },
  { id: 'double-bass', name: 'Double bass', keyLabel: 'C', family: 'strings', transposition: 'c_octave_down', tunerInstrument: 'strings', clef: 'bass' },

  { id: 'voice', name: 'Voice', keyLabel: 'C', family: 'voice', transposition: 'concert', tunerInstrument: 'voice', clef: 'treble' },

  { id: 'guitar', name: 'Guitar', keyLabel: 'C', family: 'keys', transposition: 'c_octave_down', tunerInstrument: 'strings', clef: 'treble' },
  { id: 'piano', name: 'Piano', keyLabel: 'C', family: 'keys', transposition: 'concert', tunerInstrument: 'strings', clef: 'treble' },
] as const

export const DEFAULT_PRACTICE_GAME_INSTRUMENT_ID = 'trumpet'

const INSTRUMENT_STORAGE_KEY = 'besttake.practiceGames.instrument'

/**
 * Written pitch Staff Jumper reads for a tuner transposition.
 *
 * Staff Jumper only cares about the key the part is written in, not the octave
 * the instrument sounds in — a tenor sax reads the same B♭ part a trumpet does,
 * an octave lower — so every octave variant folds onto its base key.
 */
const STAFF_TRANSPOSITION_BY_TUNER: Record<TunerTranspositionId, StaffJumperTransposition> = {
  concert: 'concert',
  c_octave_up: 'concert',
  c_two_octaves_up: 'concert',
  c_octave_down: 'concert',
  bb: 'bb',
  bb_octave: 'bb',
  bb_two_octaves: 'bb',
  eb_high: 'eb',
  eb: 'eb',
  eb_octave: 'eb',
  f: 'f',
  g: 'g',
  a: 'a',
  /** D trumpet has no written-pitch entry of its own; read it in concert. */
  d_high: 'concert',
}

export function staffJumperTranspositionFor(
  instrument: PracticeGameInstrument,
): StaffJumperTransposition {
  return STAFF_TRANSPOSITION_BY_TUNER[instrument.transposition] ?? 'concert'
}

export function getPracticeGameInstrument(id: string): PracticeGameInstrument {
  return (
    PRACTICE_GAME_INSTRUMENTS.find((instrument) => instrument.id === id) ??
    PRACTICE_GAME_INSTRUMENTS.find((instrument) => instrument.id === DEFAULT_PRACTICE_GAME_INSTRUMENT_ID)!
  )
}

/** Tuner settings an instrument implies — what the menu writes back to the app. */
export function practiceGameInstrumentSettings(instrument: PracticeGameInstrument): {
  tunerInstrument: TunerInstrument
  tunerTransposition: TunerTranspositionId
} {
  return {
    tunerInstrument: instrument.tunerInstrument,
    tunerTransposition: instrument.transposition,
  }
}

/**
 * The instrument to show, given the stored pick and the app's tuner settings.
 *
 * The stored id wins while it still agrees with the tuner, so "Trumpet" keeps
 * saying Trumpet rather than collapsing to the first B♭ entry in the list. When
 * the tuner has moved on — changed in Settings, in the tuner itself, or by
 * Balance's own instrument picker — the settings win, because they are what the
 * games will actually be listening with.
 */
export function resolvePracticeGameInstrument(
  storedId: string | null,
  transposition: TunerTranspositionId,
  tunerInstrument: TunerInstrument,
): PracticeGameInstrument {
  const stored = storedId
    ? PRACTICE_GAME_INSTRUMENTS.find((instrument) => instrument.id === storedId)
    : undefined
  if (
    stored &&
    stored.transposition === transposition &&
    stored.tunerInstrument === tunerInstrument
  ) {
    return stored
  }
  return (
    PRACTICE_GAME_INSTRUMENTS.find(
      (instrument) =>
        instrument.transposition === transposition && instrument.tunerInstrument === tunerInstrument,
    ) ??
    PRACTICE_GAME_INSTRUMENTS.find((instrument) => instrument.transposition === transposition) ??
    getPracticeGameInstrument(DEFAULT_PRACTICE_GAME_INSTRUMENT_ID)
  )
}

export function loadPracticeGameInstrumentId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(INSTRUMENT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function savePracticeGameInstrumentId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, id)
  } catch {
    // React state still holds the selection for this session.
  }
}

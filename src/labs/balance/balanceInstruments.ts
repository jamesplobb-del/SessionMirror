/**
 * Balance's instruments, taken from Staff Jumper's table.
 *
 * Range is the whole point of this game — a level that asks for a note the
 * horn cannot play is not hard, it is broken — and Staff Jumper already keeps
 * the practical *written* ranges and the octave each instrument's first scale
 * is printed in. Balance had its own hand-typed list that disagreed with it
 * (its tuba topped out a fifth low, its "home" notes were guesses); one table
 * is now the source of truth for both games.
 *
 * Two things are Balance's own, because Staff Jumper cannot express them:
 *
 *   • **Octave transpositions.** Staff Jumper's type only admits `bb`/`eb`, so
 *     a tenor sax is listed as B♭. Balance compares against the microphone, so
 *     it needs the pitch that actually sounds — written C4 on a tenor is
 *     concert B♭2, an octave below what plain `bb` would predict. Getting this
 *     wrong means the game never hears the note the player is holding.
 *   • **Instruments with no staff.** Balance shows no notation, so viola (alto
 *     clef) and a plain concert-pitch option can exist here even though Staff
 *     Jumper has to leave them out.
 */
import { STAFF_JUMPER_INSTRUMENTS } from '../staffJumper/staffJumperInstruments'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { TunerTranspositionId } from '../../utils/tunerTransposition'
import type { BalanceInstrument } from './balanceTypes'

/**
 * Instruments whose written pitch sounds an octave (or more) below what the
 * plain B♭/E♭ transposition implies. Balance must use the sounding pitch.
 */
const OCTAVE_TRANSPOSITIONS: Record<string, TunerTranspositionId> = {
  'tenor-sax': 'bb_octave',
  'bass-clarinet': 'bb_octave',
  'bari-sax': 'eb_octave',
  'euphonium-treble': 'bb_octave',
}

/** Which pitch-detection profile each family is tracked with. */
const FAMILY_PROFILE: Record<string, TunerInstrument> = {
  Brass: 'winds',
  Woodwind: 'winds',
  Strings: 'strings',
  'Voice & keys': 'voice',
}

const N = { C2: 36, C3: 48, C4: 60, E6: 88, C6: 84 } as const

/**
 * Balance-only entries, appended after the shared table.
 *
 * `concert` stays first because it is the fallback for a player who has not
 * picked an instrument, and every lookup falls back to index 0.
 */
const BALANCE_ONLY: readonly BalanceInstrument[] = [
  {
    id: 'concert',
    name: 'Concert Pitch',
    transposition: 'concert',
    tunerInstrument: 'voice',
    clef: 'treble',
    family: 'Voice & keys',
    minWrittenMidi: N.C3,
    homeWrittenMidi: N.C4,
    maxWrittenMidi: N.C6,
  },
  {
    // Alto clef, so Staff Jumper cannot list it; Balance draws no staff.
    id: 'viola',
    name: 'Viola',
    transposition: 'concert',
    tunerInstrument: 'strings',
    clef: 'alto',
    family: 'Strings',
    minWrittenMidi: N.C3,
    homeWrittenMidi: N.C4,
    maxWrittenMidi: N.E6,
  },
]

function fromStaffJumper(): BalanceInstrument[] {
  return STAFF_JUMPER_INSTRUMENTS.map((instrument): BalanceInstrument => ({
    id: instrument.id,
    name: instrument.name,
    transposition: OCTAVE_TRANSPOSITIONS[instrument.id] ?? instrument.transposition,
    tunerInstrument: FAMILY_PROFILE[instrument.family] ?? 'winds',
    clef: instrument.clef,
    family: instrument.family,
    minWrittenMidi: instrument.range.minMidi,
    maxWrittenMidi: instrument.range.maxMidi,
    // The octave the method book prints this instrument's first scale in —
    // which is exactly where a long-tone page starts it too.
    homeWrittenMidi: instrument.homeRootMidi,
  }))
}

export const BALANCE_INSTRUMENTS: readonly BalanceInstrument[] = [
  BALANCE_ONLY[0]!,
  ...fromStaffJumper(),
  BALANCE_ONLY[1]!,
]

/**
 * Ids Balance used before it shared Staff Jumper's table.
 *
 * A saved setting is just a string, so without this every existing player
 * would silently fall back to Concert Pitch and lose their instrument.
 */
const LEGACY_IDS: Record<string, string> = {
  'bb-trumpet': 'trumpet',
  'bb-clarinet': 'clarinet',
  'baritone-sax': 'bari-sax',
  'f-horn': 'french-horn',
  voice: 'voice-treble',
}

export function resolveBalanceInstrumentId(id: string): string {
  return LEGACY_IDS[id] ?? id
}

export function getBalanceInstrument(id: string): BalanceInstrument {
  const resolved = resolveBalanceInstrumentId(id)
  return (
    BALANCE_INSTRUMENTS.find((instrument) => instrument.id === resolved) ??
    BALANCE_INSTRUMENTS[0]!
  )
}

/**
 * Best guess at the horn from the app-wide tuner settings, for a player
 * arriving at Balance for the first time.
 */
export function inferBalanceInstrument(
  transposition: TunerTranspositionId,
  profile: TunerInstrument,
): BalanceInstrument {
  return (
    BALANCE_INSTRUMENTS.find(
      (instrument) =>
        instrument.transposition === transposition && instrument.tunerInstrument === profile,
    ) ??
    BALANCE_INSTRUMENTS.find((instrument) => instrument.transposition === transposition) ??
    BALANCE_INSTRUMENTS[0]!
  )
}

export function clampWrittenMidi(midi: number, instrument: BalanceInstrument): number {
  return Math.max(
    instrument.minWrittenMidi,
    Math.min(instrument.maxWrittenMidi, Math.round(midi)),
  )
}

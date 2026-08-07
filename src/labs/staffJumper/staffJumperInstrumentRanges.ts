/**
 * Practical WRITTEN ranges per instrument family, in MIDI numbers.
 *
 * These are the notes a player actually reads off the page, so they already
 * include the instrument's transposition. A Bb trumpet reading written C4
 * sounds concert Bb3, but the staff still shows C4 — so the table is keyed by
 * the "Written pitch" setting, not by sounding pitch.
 *
 * Bounds are the practical teaching range (what shows up in method books and
 * band literature), not the extreme professional range. Staff Jumper uses them
 * to pick the octave a scale is written in, so overshooting here is what puts
 * a 2-octave trumpet Bb scale on double high Bb instead of the normal Bb5.
 */
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { TunerTranspositionId } from '../../utils/tunerTransposition'
import type { StaffJumperClef } from './staffNotationMap'

export type StaffJumperTransposition = Extract<
  TunerTranspositionId,
  'concert' | 'bb' | 'eb' | 'f' | 'g' | 'a'
>

export interface WrittenRange {
  /** Lowest comfortably written note (MIDI). */
  minMidi: number
  /** Highest comfortably written note (MIDI). */
  maxMidi: number
  /** Shown in the setup screen so the player can sanity-check the fit. */
  label: string
}

/** MIDI helpers so the table below reads like note names. */
const N = {
  E2: 40, F2: 41, G2: 43, A2: 45, B2: 47,
  C3: 48, D3: 50, E3: 52, F3: 53, Fs3: 54, G3: 55, A3: 57, Bb3: 58,
  C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69,
  C5: 72, D5: 74, E5: 76, G5: 79, A5: 81,
  C6: 84, D6: 86, E6: 88, Fs6: 90, G6: 91,
} as const

/**
 * Treble-clef ranges by written-pitch transposition.
 * `concert` is refined further by tuner instrument (voice vs strings vs winds).
 */
const TREBLE_RANGES: Record<StaffJumperTransposition, WrittenRange> = {
  concert: { minMidi: N.G3, maxMidi: N.G6, label: 'G3–G6' },
  /** Trumpet, Bb clarinet, tenor sax — low F#3, top around written D6. */
  bb: { minMidi: N.Fs3, maxMidi: N.D6, label: 'F♯3–D6' },
  /** Alto and bari sax — written low Bb3 up to F#6. */
  eb: { minMidi: N.Bb3, maxMidi: N.Fs6, label: 'B♭3–F♯6' },
  /** French horn in F reads treble from written F3 to about C6. */
  f: { minMidi: N.F3, maxMidi: N.C6, label: 'F3–C6' },
  /** Alto flute in G. */
  g: { minMidi: N.C4, maxMidi: N.G6, label: 'C4–G6' },
  /** Clarinet in A — same shape as the Bb clarinet, one lower. */
  a: { minMidi: N.E3, maxMidi: N.D6, label: 'E3–D6' },
}

/** Concert-pitch treble readers differ a lot; split them by tuner profile. */
const CONCERT_TREBLE_BY_INSTRUMENT: Record<TunerInstrument, WrittenRange> = {
  voice: { minMidi: N.G3, maxMidi: N.A5, label: 'G3–A5' },
  strings: { minMidi: N.G3, maxMidi: N.G6, label: 'G3–G6' },
  winds: { minMidi: N.C4, maxMidi: N.G6, label: 'C4–G6' },
}

/**
 * Bass clef is read by trombone, euphonium, tuba, bassoon, cello and bass —
 * all concert-pitch instruments, so the transposition setting does not move
 * the written register the way it does in treble.
 */
const BASS_RANGE: WrittenRange = { minMidi: N.E2, maxMidi: N.C5, label: 'E2–C5' }

const BASS_RANGE_BY_INSTRUMENT: Record<TunerInstrument, WrittenRange> = {
  voice: { minMidi: N.F2, maxMidi: N.F4, label: 'F2–F4' },
  strings: BASS_RANGE,
  winds: BASS_RANGE,
}

export function getWrittenRange(
  transposition: StaffJumperTransposition,
  clef: StaffJumperClef,
  tunerInstrument: TunerInstrument,
): WrittenRange {
  if (clef === 'bass') return BASS_RANGE_BY_INSTRUMENT[tunerInstrument]
  if (transposition === 'concert') return CONCERT_TREBLE_BY_INSTRUMENT[tunerInstrument]
  return TREBLE_RANGES[transposition]
}

/** Pitch at the visual middle of each staff — the ideal center for a scale. */
export const STAFF_CENTER_MIDI: Record<StaffJumperClef, number> = {
  /** B4, the middle line of the treble staff. */
  treble: 71,
  /** D3, the middle line of the bass staff. */
  bass: 50,
}

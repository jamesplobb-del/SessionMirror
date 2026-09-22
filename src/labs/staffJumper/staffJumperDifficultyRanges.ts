/**
 * The written range each difficulty starts from, per instrument.
 *
 * Choosing Easy, Medium or Hard sets the exercise range to these notes; the
 * player can still drag the range picker anywhere inside the instrument's
 * compass afterwards. The point is that a beginner who only taps "Easy" gets
 * notes a beginner on *that* instrument actually plays — a Grade 1 clarinet
 * part never crosses the break, so Easy on clarinet does not either.
 *
 * Sources, and how each tier maps onto them:
 *
 * • Band winds — David Marlatt, "Defining the Wind Band Grade System: Range
 *   Guidelines for Wind Band Music" (Eighth Note Publications), transposed
 *   chart. Easy = its Grade 1.5 range, Medium = Grade 2, Hard = Grade 3, using
 *   the first part's range where a section is split, and never the optional
 *   extension notes printed beside each range. Each tier also keeps the notes
 *   of the tier below, so a harder setting never takes a note away.
 *   https://rongbingshen.com/wp-content/uploads/2020/12/wind-band-grading-system.pdf
 *   Its Grade 1.5 clarinet range, F3–B♭4, is the rule the other grading
 *   guides state in words: "Clarinet parts must not cross the break" (Bandworld,
 *   Music Selection Through Grading — Grade 1) and "clarinet crossing the
 *   break" is listed under Things to Avoid at Grade 1 in the American Band
 *   College Music Grading Chart.
 *
 * • Violin and viola — Alfred Music, "Submission Guidelines for Orchestra":
 *   Grade 1–1½ first position with no extensions; Grade 2–2½ first through
 *   third positions with extensions; Grade 3–3½ first through fifth positions.
 *   https://images.alfred.com/submissions/orchestra-guidelines.pdf
 *   Converted to the highest note the fourth finger reaches on the top string
 *   in that position (violin E string: B5 / E♭6 / F♯6; viola A string:
 *   E5 / A♭5 / B5); the open bottom string is the floor.
 *
 * • Cello and double bass — the same Alfred guideline gives first position for
 *   beginners, which is Easy here (cello A string, fourth finger D4; bass G
 *   string, fourth finger written B3). Cello and bass position numbering above
 *   first differs between methods, so Medium and Hard leave the range to the
 *   key and octave setting, as before, rather than guess at a conversion.
 *
 * Derived rather than read off a chart, and said so:
 * • Soprano sax uses the alto/tenor rows — every saxophone reads the same
 *   written range with the same fingerings, and the chart's alto and tenor
 *   rows are identical.
 * • Treble-clef euphonium is the chart's trombone/baritone row written up a
 *   major ninth, which is exactly what a B♭ treble-clef part is.
 * • Piccolo uses the flute row: it reads the flute's written notes with the
 *   flute's fingerings, and no grading source rates it below Grade 3.
 *
 * Instruments with no graded source (recorder, guitar, bass guitar, ukulele)
 * are absent on purpose: their range stays what the key and octave setting
 * give, exactly as before.
 */
import type { StaffJumperDifficulty } from './staffJumperMusicLogic'

export interface DifficultyRange {
  lowMidi: number
  highMidi: number
}

type Tiers = Record<StaffJumperDifficulty, DifficultyRange | null>

/** MIDI numbers so the table reads like note names (middle C = C4 = 60). */
const N = {
  A1: 33, G1: 31, Bb1: 34,
  C2: 36, D2: 38, Eb2: 39, E2: 40, F2: 41, A2: 45, Bb2: 46,
  C3: 48, E3: 52, F3: 53, G3: 55, A3: 57, Bb3: 58, B3: 59,
  C4: 60, D4: 62, Eb4: 63, E4: 64, F4: 65, G4: 67, Bb4: 70,
  C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, Ab5: 80, A5: 81, Bb5: 82, B5: 83,
  C6: 84, D6: 86, Eb6: 87, F6: 89, Fs6: 90,
} as const

const r = (lowMidi: number, highMidi: number): DifficultyRange => ({ lowMidi, highMidi })

/** Easy ⊂ Medium ⊂ Hard: a harder tier keeps every note of the one below. */
function nested(easy: DifficultyRange, medium: DifficultyRange | null, hard: DifficultyRange | null): Tiers {
  const widen = (inner: DifficultyRange, outer: DifficultyRange) =>
    r(Math.min(inner.lowMidi, outer.lowMidi), Math.max(inner.highMidi, outer.highMidi))
  const mid = medium ? widen(easy, medium) : null
  return { easy, medium: mid, hard: hard ? widen(mid ?? easy, hard) : null }
}

const FLUTE = nested(r(N.G4, N.Bb5), r(N.F4, N.C6), r(N.Eb4, N.F6))
const SAX = nested(r(N.G4, N.G5), r(N.E4, N.A5), r(N.D4, N.D6))
const LOW_BRASS = nested(r(N.A2, N.Bb3), r(N.A2, N.Bb3), r(N.F2, N.F4))
const NINTH = 14

const TIERS: Record<string, Tiers> = {
  flute: FLUTE,
  piccolo: FLUTE,
  oboe: nested(r(N.F4, N.G5), r(N.Eb4, N.G5), r(N.Eb4, N.Bb5)),
  // Grade 1.5 stops on throat B♭ — the break is Grade 2 material.
  clarinet: nested(r(N.F3, N.Bb4), r(N.F3, N.G5), r(N.E3, N.C6)),
  'bass-clarinet': nested(r(N.F3, N.Bb4), r(N.E3, N.Bb4), r(N.E3, N.Bb4)),
  bassoon: nested(r(N.F2, N.F3), r(N.Eb2, N.C4), r(N.D2, N.F4)),
  'soprano-sax': SAX,
  'alto-sax': SAX,
  'tenor-sax': SAX,
  'bari-sax': nested(r(N.D4, N.G5), r(N.C4, N.G5), r(N.B3, N.G5)),
  trumpet: nested(r(N.Bb3, N.C5), r(N.C4, N.F5), r(N.A3, N.G5)),
  'french-horn': nested(r(N.Bb3, N.Bb4), r(N.C4, N.C5), r(N.C4, N.E5)),
  trombone: LOW_BRASS,
  euphonium: LOW_BRASS,
  'euphonium-treble': {
    easy: r(N.A2 + NINTH, N.Bb3 + NINTH),
    medium: r(N.A2 + NINTH, N.Bb3 + NINTH),
    hard: r(N.F2 + NINTH, N.F4 + NINTH),
  },
  tuba: nested(r(N.A1, N.Bb2), r(N.A1, N.C3), r(N.G1, N.C3)),
  violin: nested(r(N.G3, N.B5), r(N.G3, N.Eb6), r(N.G3, N.Fs6)),
  viola: nested(r(N.C3, N.E5), r(N.C3, N.Ab5), r(N.C3, N.B5)),
  cello: { easy: r(N.C2, N.D4), medium: null, hard: null },
  'double-bass': { easy: r(N.E2, N.B3), medium: null, hard: null },
}

/**
 * The range a difficulty starts from on this instrument, or null when there is
 * no graded source for it — the caller then leaves the range to the key and
 * the octave setting, as it always has.
 */
export function difficultyRangeFor(
  instrumentId: string | null,
  difficulty: StaffJumperDifficulty,
): DifficultyRange | null {
  if (!instrumentId) return null
  return TIERS[instrumentId]?.[difficulty] ?? null
}

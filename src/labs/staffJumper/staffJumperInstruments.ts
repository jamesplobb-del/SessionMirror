/**
 * The instruments Staff Jumper can set itself up for.
 *
 * Picking one answers three reading questions the setup screen would otherwise
 * ask separately:
 *
 *   • which clef the part is printed in,
 *   • which written pitch the player reads — a B♭ trumpet's written C sounds
 *     concert B♭, so the staff and the microphone must agree about it, and
 *   • which scale that instrument actually starts from.
 *
 * The third is the one a concert-C default gets wrong. Every American band
 * method opens on the concert B♭ major scale, written in each instrument's own
 * key — C on the trumpet, B♭ on the trombone, G on the alto sax — which is the
 * same scale Learn Your Instrument teaches as "my first 8 notes". Strings do
 * not read from the band books, so they start where the string class starts,
 * in D.
 *
 * Ranges are *written* (what is printed on the page) and practical rather than
 * professional: they decide which octave a scale lands in, and overshooting
 * here is what puts a 2-octave trumpet scale on double high B♭. The wind
 * numbers are Learn Your Instrument's chromatic-course bounds, which come from
 * the standard printed fingering charts.
 *
 * Alto clef is not in Staff Jumper's notation map, so viola is deliberately
 * absent rather than listed against a clef a violist does not read.
 */
import { INSTRUMENT_FAMILIES, type InstrumentFamily } from '../../utils/instrumentProfiles'
import type { TunerInstrument } from '../../utils/pitchConfig'
import {
  getWrittenRange,
  type StaffJumperTransposition,
  type WrittenRange,
} from './staffJumperInstrumentRanges'
import type {
  StaffJumperKey,
  StaffJumperMajorKey,
  StaffJumperMinorKey,
  StaffJumperScaleMode,
} from './staffJumperMusicLogic'
import type { StaffJumperClef } from './staffNotationMap'

export interface StaffJumperInstrument {
  id: string
  /** Shown in the dropdown. Long enough to be unambiguous on a phone. */
  name: string
  /** Shown on the settings chip, which has about a dozen characters of room. */
  shortName: string
  family: InstrumentFamily
  clef: StaffJumperClef
  /** Written pitch, in the same vocabulary as the written-pitch row. */
  transposition: StaffJumperTransposition
  /** Comfortable written range — the notes this player reads off the page. */
  range: WrittenRange
  /**
   * Written key of this instrument's first scale: concert B♭ major as this
   * instrument spells it, or D for strings.
   */
  homeKey: StaffJumperMajorKey
  /**
   * Written MIDI of that first scale's tonic — the octave the method book
   * prints it in.
   *
   * Only consulted when the chosen key *is* the home key, and only strongly
   * enough to beat the "centre it on the staff" tie-break, never a range fit.
   * It is what keeps a tuba's B♭ scale on the low B♭ it is taught on rather
   * than the octave that happens to sit prettiest on the staff.
   */
  homeRootMidi: number
}

/** MIDI numbers so the table below reads like note names. */
const N = {
  E1: 28, Bb1: 34,
  C2: 36, E2: 40, F2: 41, Bb2: 46, C3: 48,
  D3: 50, E3: 52, F3: 53, Fs3: 54, G3: 55, Bb3: 58,
  C4: 60, D4: 62, F4: 65, G4: 67, Bb4: 70,
  C5: 72, D5: 74, A5: 81, C6: 84, E6: 88, Fs6: 90, G6: 91,
} as const

/**
 * Flats everywhere except F♯, which is how every brass and saxophone chart
 * spells the note at the bottom of the horn.
 */
const NOTE_LABELS = [
  'C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B',
] as const

function writtenNoteLabel(midi: number): string {
  return `${NOTE_LABELS[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

function reads(minMidi: number, maxMidi: number): WrittenRange {
  return {
    minMidi,
    maxMidi,
    label: `${writtenNoteLabel(minMidi)}–${writtenNoteLabel(maxMidi)}`,
  }
}

export const STAFF_JUMPER_INSTRUMENTS: readonly StaffJumperInstrument[] = [
  /* ── Brass ── */
  {
    id: 'trumpet', name: 'B♭ Trumpet / Cornet', shortName: 'Trumpet', family: 'Brass',
    clef: 'treble', transposition: 'bb', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.Fs3, N.C6),
  },
  {
    // Written F4 rather than the F3 some books print: it sounds concert B♭3,
    // in the middle of the horn, where a student can actually hold the pitch.
    id: 'french-horn', name: 'French Horn (F)', shortName: 'Horn', family: 'Brass',
    clef: 'treble', transposition: 'f', homeKey: 'F', homeRootMidi: N.F4,
    range: reads(N.F3, N.C6),
  },
  {
    id: 'trombone', name: 'Trombone', shortName: 'Trombone', family: 'Brass',
    clef: 'bass', transposition: 'concert', homeKey: 'Bb', homeRootMidi: N.Bb2,
    range: reads(N.E2, N.Bb4),
  },
  {
    id: 'euphonium', name: 'Euphonium / Baritone (bass clef)', shortName: 'Euphonium', family: 'Brass',
    clef: 'bass', transposition: 'concert', homeKey: 'Bb', homeRootMidi: N.Bb2,
    range: reads(N.E2, N.Bb4),
  },
  {
    // The same horn reading a B♭ treble part, which is how a lot of band and
    // brass-band parts are printed.
    id: 'euphonium-treble', name: 'Euphonium / Baritone (treble clef)', shortName: 'Euphonium (T.C.)', family: 'Brass',
    clef: 'treble', transposition: 'bb', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.Fs3, N.C6),
  },
  {
    id: 'tuba', name: 'Tuba', shortName: 'Tuba', family: 'Brass',
    clef: 'bass', transposition: 'concert', homeKey: 'Bb', homeRootMidi: N.Bb1,
    range: reads(N.E1, N.Bb3),
  },

  /* ── Woodwinds ── */
  {
    id: 'flute', name: 'Flute', shortName: 'Flute', family: 'Woodwind',
    clef: 'treble', transposition: 'concert', homeKey: 'Bb', homeRootMidi: N.Bb4,
    range: reads(N.C4, N.G6),
  },
  {
    id: 'piccolo', name: 'Piccolo', shortName: 'Piccolo', family: 'Woodwind',
    clef: 'treble', transposition: 'concert', homeKey: 'Bb', homeRootMidi: N.Bb4,
    range: reads(N.D4, N.G6),
  },
  {
    id: 'oboe', name: 'Oboe', shortName: 'Oboe', family: 'Woodwind',
    clef: 'treble', transposition: 'concert', homeKey: 'Bb', homeRootMidi: N.Bb4,
    range: reads(N.Bb3, N.G6),
  },
  {
    id: 'clarinet', name: 'B♭ Clarinet', shortName: 'Clarinet', family: 'Woodwind',
    clef: 'treble', transposition: 'bb', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.E3, N.C6),
  },
  {
    id: 'bass-clarinet', name: 'Bass Clarinet', shortName: 'Bass Clarinet', family: 'Woodwind',
    clef: 'treble', transposition: 'bb', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.E3, N.C6),
  },
  {
    id: 'soprano-sax', name: 'B♭ Soprano Sax', shortName: 'Soprano Sax', family: 'Woodwind',
    clef: 'treble', transposition: 'bb', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.Bb3, N.Fs6),
  },
  {
    id: 'alto-sax', name: 'E♭ Alto Sax', shortName: 'Alto Sax', family: 'Woodwind',
    clef: 'treble', transposition: 'eb', homeKey: 'G', homeRootMidi: N.G4,
    range: reads(N.Bb3, N.Fs6),
  },
  {
    id: 'tenor-sax', name: 'B♭ Tenor Sax', shortName: 'Tenor Sax', family: 'Woodwind',
    clef: 'treble', transposition: 'bb', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.Bb3, N.Fs6),
  },
  {
    id: 'bari-sax', name: 'E♭ Baritone Sax', shortName: 'Bari Sax', family: 'Woodwind',
    clef: 'treble', transposition: 'eb', homeKey: 'G', homeRootMidi: N.G4,
    range: reads(N.Bb3, N.Fs6),
  },
  {
    id: 'bassoon', name: 'Bassoon', shortName: 'Bassoon', family: 'Woodwind',
    clef: 'bass', transposition: 'concert', homeKey: 'Bb', homeRootMidi: N.Bb2,
    range: reads(N.Bb1, N.D5),
  },
  {
    // Not a band instrument, so it keeps its own home octave of C.
    id: 'recorder', name: 'Soprano Recorder', shortName: 'Recorder', family: 'Woodwind',
    clef: 'treble', transposition: 'concert', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.C4, N.C6),
  },

  /* ── Strings ── */
  {
    id: 'violin', name: 'Violin', shortName: 'Violin', family: 'Strings',
    clef: 'treble', transposition: 'concert', homeKey: 'D', homeRootMidi: N.D4,
    range: reads(N.G3, N.G6),
  },
  {
    // D3 is the open D string and first position; the octave below reads just
    // as neatly on the staff, which is why this one is spelled out.
    id: 'cello', name: 'Cello', shortName: 'Cello', family: 'Strings',
    clef: 'bass', transposition: 'concert', homeKey: 'D', homeRootMidi: N.D3,
    range: reads(N.C2, N.C5),
  },
  {
    id: 'double-bass', name: 'Double Bass', shortName: 'Double Bass', family: 'Strings',
    clef: 'bass', transposition: 'concert', homeKey: 'D', homeRootMidi: N.D3,
    range: reads(N.E2, N.G4),
  },
  {
    id: 'guitar', name: 'Guitar', shortName: 'Guitar', family: 'Strings',
    clef: 'treble', transposition: 'concert', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.E3, N.E6),
  },
  {
    id: 'bass-guitar', name: 'Bass Guitar', shortName: 'Bass Guitar', family: 'Strings',
    clef: 'bass', transposition: 'concert', homeKey: 'C', homeRootMidi: N.C3,
    range: reads(N.E2, N.G4),
  },
  {
    id: 'ukulele', name: 'Ukulele', shortName: 'Ukulele', family: 'Strings',
    clef: 'treble', transposition: 'concert', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.C4, N.C6),
  },

  /* ── Voice & keys ── */
  {
    id: 'voice-treble', name: 'Voice (treble clef)', shortName: 'Voice', family: 'Voice & keys',
    clef: 'treble', transposition: 'concert', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.G3, N.A5),
  },
  {
    id: 'voice-bass', name: 'Voice (bass clef)', shortName: 'Voice (bass)', family: 'Voice & keys',
    clef: 'bass', transposition: 'concert', homeKey: 'C', homeRootMidi: N.C3,
    range: reads(N.F2, N.F4),
  },
  {
    id: 'piano-treble', name: 'Piano / Keys (right hand)', shortName: 'Piano (R.H.)', family: 'Voice & keys',
    clef: 'treble', transposition: 'concert', homeKey: 'C', homeRootMidi: N.C4,
    range: reads(N.C4, N.C6),
  },
  {
    id: 'piano-bass', name: 'Piano / Keys (left hand)', shortName: 'Piano (L.H.)', family: 'Voice & keys',
    clef: 'bass', transposition: 'concert', homeKey: 'C', homeRootMidi: N.C3,
    range: reads(N.C2, N.C4),
  },
] as const

/** Dropdown group order — the same families the onboarding picker uses. */
export const STAFF_JUMPER_INSTRUMENT_FAMILIES = INSTRUMENT_FAMILIES

const INSTRUMENT_BY_ID = new Map(
  STAFF_JUMPER_INSTRUMENTS.map((instrument) => [instrument.id, instrument]),
)

export function getStaffJumperInstrument(
  id: string | null | undefined,
): StaffJumperInstrument | undefined {
  return id ? INSTRUMENT_BY_ID.get(id) : undefined
}

export function getStaffJumperInstrumentsByFamily(
  family: InstrumentFamily,
): StaffJumperInstrument[] {
  return STAFF_JUMPER_INSTRUMENTS.filter((instrument) => instrument.family === family)
}

/** Relative minor of every key, so a minor exercise keeps the home signature. */
const RELATIVE_MINOR: Record<StaffJumperMajorKey, StaffJumperMinorKey> = {
  C: 'A',
  Db: 'Bb',
  D: 'B',
  Eb: 'C',
  E: 'C#',
  F: 'D',
  Gb: 'Eb',
  G: 'E',
  Ab: 'F',
  A: 'F#',
  Bb: 'G',
  B: 'G#',
}

/**
 * The key an instrument should land on when it is picked.
 *
 * Minor gets the relative minor rather than the parallel one: same signature,
 * same finger patterns, so it is still recognisably the scale this player has
 * been taught.
 */
export function homeKeyForInstrument(
  instrument: StaffJumperInstrument,
  scaleMode: StaffJumperScaleMode,
): StaffJumperKey {
  return scaleMode === 'major' ? instrument.homeKey : RELATIVE_MINOR[instrument.homeKey]
}

/**
 * Written range for a setup, preferring the chosen instrument's own bounds and
 * falling back to the written-pitch table when the player has gone custom.
 */
export function resolveWrittenRange(
  instrumentId: string | null | undefined,
  transposition: StaffJumperTransposition,
  clef: StaffJumperClef,
  tunerInstrument: TunerInstrument,
): WrittenRange {
  return (
    getStaffJumperInstrument(instrumentId)?.range ??
    getWrittenRange(transposition, clef, tunerInstrument)
  )
}

/**
 * The octave this instrument's method book prints the chosen scale in, or null
 * when the player has left home — a trumpeter reading E♭ major gets no opinion
 * from the first eight notes they ever learned.
 */
export function preferredScaleRootMidi(
  instrumentId: string | null | undefined,
  key: StaffJumperKey,
  scaleMode: StaffJumperScaleMode,
): number | null {
  if (scaleMode !== 'major') return null
  const instrument = getStaffJumperInstrument(instrumentId)
  if (!instrument || instrument.homeKey !== key) return null
  return instrument.homeRootMidi
}

const INSTRUMENT_STORAGE_KEY = 'sessionmirror:staff-jumper-instrument'

/**
 * Learn Your Instrument's own saved pick, read raw.
 *
 * A player who has already told that screen what they play should not have to
 * say it again here. Importing its hook would pull the whole lesson dataset
 * into this bundle for one string, so the key is duplicated instead — it is
 * versioned, and a miss just means the picker opens unset.
 * Source: `LESSON_STORAGE_KEY` in labs/learnInstrument/useLearnInstrumentGame.
 */
const LESSON_STORAGE_KEY = 'session-mirror.learn-instrument.v1'

const LESSON_INSTRUMENT_IDS: Record<string, string> = {
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

function readLessonInstrumentId(): string | null {
  try {
    const raw = window.localStorage.getItem(LESSON_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { selectedInstrumentId?: unknown }
    const lessonId =
      typeof parsed.selectedInstrumentId === 'string' ? parsed.selectedInstrumentId : null
    return lessonId ? (LESSON_INSTRUMENT_IDS[lessonId] ?? null) : null
  } catch {
    return null
  }
}

/** Saved pick first, then whatever Learn Your Instrument already knows. */
export function loadStaffJumperInstrumentId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = window.localStorage.getItem(INSTRUMENT_STORAGE_KEY)
    if (saved && INSTRUMENT_BY_ID.has(saved)) return saved
    // An empty string is the stored form of a deliberate "custom" setup.
    if (saved === '') return null
  } catch {
    return null
  }
  return readLessonInstrumentId()
}

export function saveStaffJumperInstrumentId(id: string | null): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, id ?? '')
  } catch {
    // Storage can be unavailable in private browsing; the session still holds.
  }
}

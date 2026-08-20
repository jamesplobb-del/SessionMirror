/**
 * Lesson data for Learn Your Instrument.
 *
 * Two courses per instrument:
 *
 *  • `beginner` — the first eight notes a method book teaches. For the band
 *    instruments that is one octave of the concert B♭ major scale, written in
 *    each instrument's own key and register, because that is the first scale
 *    every American band method introduces and it is what puts a whole class
 *    on the same concert pitches. The recorder, which is not a band
 *    instrument, gets its own home octave of C.
 *
 *  • `chromatic` — every semitone through the instrument's practical playing
 *    range, using the primary fingering for each note.
 *
 * Fingerings follow the standard printed charts rather than anything invented
 * here. The flute table is transcribed from the Woodwind Fingering Guide's
 * basic charts; the brass tables are derived from the harmonic series, where a
 * valve combination or slide position follows exactly from the partial.
 */

export const LESSON_DATA_VERSION = 2 as const

export type InstrumentId =
  | 'flute'
  | 'bb-clarinet'
  | 'alto-sax'
  | 'tenor-sax'
  | 'bb-trumpet'
  | 'trombone'
  | 'baritone'
  | 'tuba'
  | 'soprano-recorder'

export type InstrumentFamily = 'woodwind' | 'brass'
export type LessonClef = 'treble' | 'bass'
export type ChartKind =
  | 'flute'
  | 'clarinet'
  | 'saxophone'
  | 'valves'
  | 'slide'
  | 'recorder'

export type StaffLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
export type StaffAccidental = '#' | 'b'

export interface StaffPitch {
  letter: StaffLetter
  octave: number
  accidental?: StaffAccidental
}

/**
 * Keys and holes a chart can light up.
 *
 * Named for the job the control does rather than for any one maker's
 * hardware, so the same id means the same thing on every chart that has it.
 */
export type WoodwindControlId =
  | 'thumb'
  | 'thumb-bb'
  | 'octave'
  | 'lh-1'
  | 'lh-2'
  | 'lh-3'
  | 'rh-1'
  | 'rh-2'
  | 'rh-3'
  | 'key-gsharp'
  | 'key-a'
  | 'bis'
  | 'side-a'
  | 'side-bb'
  | 'side-c'
  | 'side-eb'
  | 'side-f-sharp'
  | 'side-1'
  | 'side-2'
  | 'side-3'
  | 'side-4'
  | 'palm-d'
  | 'palm-eb'
  | 'palm-f'
  | 'front-f'
  | 'trill-d'
  | 'trill-dsharp'
  | 'foot-c'
  | 'foot-csharp'
  | 'foot-b'
  | 'pinky-f'
  | 'lp-e'
  | 'lp-fsharp'
  | 'lp-ab'
  | 'lp-csharp'
  | 'lp-gsharp'
  | 'lp-b'
  | 'lp-bb'
  | 'rp-e'
  | 'rp-fsharp'
  | 'rp-ab'
  | 'rp-eb'
  | 'rp-c'

export type ValveControlId = 'valve-1' | 'valve-2' | 'valve-3'

export type RecorderHoleControlId =
  | 'hole-1'
  | 'hole-2'
  | 'hole-3'
  | 'hole-4'
  | 'hole-5'
  | 'hole-6'
  | 'hole-7'

export type RecorderControlId = 'thumb' | RecorderHoleControlId
export type SlidePosition = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type SlideControlId = `slide-${SlidePosition}`

export type ControlId =
  | WoodwindControlId
  | ValveControlId
  | RecorderHoleControlId
  | SlideControlId

export type Fingering =
  | { kind: 'keys'; pressed: readonly WoodwindControlId[] }
  | { kind: 'valves'; pressed: readonly ValveControlId[] }
  | {
      kind: 'holes'
      covered: readonly RecorderControlId[]
      /** Compatibility alias: identical to `covered`. */
      closed: readonly RecorderControlId[]
      halfClosed?: readonly RecorderControlId[]
    }
  | { kind: 'slide'; position: SlidePosition; control: SlideControlId }

export interface LessonNote {
  id: string
  /** MIDI number as printed for the player, before transposition. */
  writtenMidi: number
  writtenLabel: string
  staff: StaffPitch
  fingering: Fingering
  /** Short, speakable fingering instruction. */
  recipe: string
  /** One-line playing cue for the displayed note. */
  detail: string
}

export type CourseId = 'beginner' | 'chromatic'

export interface Course {
  version: typeof LESSON_DATA_VERSION
  id: string
  title: string
  description: string
  notes: readonly LessonNote[]
}

export interface Instrument {
  id: InstrumentId
  name: string
  shortName: string
  family: InstrumentFamily
  clef: LessonClef
  /** Add to written MIDI to get the concert/sounding MIDI number. */
  transpositionSemitones: number
  chartKind: ChartKind
  courses: Record<CourseId, Course>
}

/* ── Spelling notes on the staff ──────────────────────────────────────────
   A chromatic run is spelled in flats, which is how band parts are written
   and how the fingering charts label the black keys. A scale that needs a
   sharp says so in its own table.
─────────────────────────────────────────────────────────────────────────── */

const FLAT_SPELLING: readonly (readonly [StaffLetter, StaffAccidental | undefined])[] = [
  ['C', undefined],
  ['D', 'b'],
  ['D', undefined],
  ['E', 'b'],
  ['E', undefined],
  ['F', undefined],
  ['G', 'b'],
  ['G', undefined],
  ['A', 'b'],
  ['A', undefined],
  ['B', 'b'],
  ['B', undefined],
]

const SHARP_SPELLING: readonly (readonly [StaffLetter, StaffAccidental | undefined])[] = [
  ['C', undefined],
  ['C', '#'],
  ['D', undefined],
  ['D', '#'],
  ['E', undefined],
  ['F', undefined],
  ['F', '#'],
  ['G', undefined],
  ['G', '#'],
  ['A', undefined],
  ['A', '#'],
  ['B', undefined],
]

const ACCIDENTAL_GLYPH: Record<StaffAccidental, string> = { '#': '♯', b: '♭' }

function staffPitchFor(midi: number, prefer: 'flat' | 'sharp'): StaffPitch {
  const table = prefer === 'sharp' ? SHARP_SPELLING : FLAT_SPELLING
  const pitchClass = ((midi % 12) + 12) % 12
  const [letter, accidental] = table[pitchClass]!
  // A flat spelling borrows its letter from the note above, so C♭ and F♭ would
  // sit an octave out if the octave were read from the MIDI number alone.
  const octave = Math.floor(midi / 12) - 1
  return accidental ? { letter, octave, accidental } : { letter, octave }
}

function labelFor(pitch: StaffPitch): string {
  return `${pitch.letter}${pitch.accidental ? ACCIDENTAL_GLYPH[pitch.accidental] : ''}${pitch.octave}`
}

/* ── Turning a fingering into words ───────────────────────────────────── */

const CONTROL_WORDS: Partial<Record<ControlId, string>> = {
  thumb: 'thumb',
  'thumb-bb': 'thumb B♭ lever',
  octave: 'octave key',
  'lh-1': 'L1',
  'lh-2': 'L2',
  'lh-3': 'L3',
  'rh-1': 'R1',
  'rh-2': 'R2',
  'rh-3': 'R3',
  'key-gsharp': 'G♯ key',
  'key-a': 'A key',
  bis: 'bis key',
  'side-bb': 'side B♭',
  'side-c': 'side C',
  'side-eb': 'E♭ key',
  'side-f-sharp': 'side F♯',
  'side-1': 'side key 1',
  'side-2': 'side key 2',
  'side-3': 'side key 3',
  'side-4': 'side key 4',
  'palm-d': 'palm D',
  'palm-eb': 'palm E♭',
  'palm-f': 'palm F',
  'front-f': 'front F',
  'trill-d': 'D trill key',
  'trill-dsharp': 'D♯ trill key',
  'foot-c': 'foot C key',
  'foot-csharp': 'foot C♯ key',
  'foot-b': 'foot B key',
  'pinky-f': 'F key',
  'lp-e': 'left E key',
  'lp-fsharp': 'left F♯ key',
  'lp-ab': 'left A♭ key',
  'lp-csharp': 'left C♯ key',
  'lp-gsharp': 'G♯ key',
  'lp-b': 'low B key',
  'lp-bb': 'low B♭ key',
  'rp-e': 'right E key',
  'rp-fsharp': 'right F♯ key',
  'rp-ab': 'right A♭ key',
  'rp-eb': 'low E♭ key',
  'rp-c': 'low C key',
  'valve-1': '1',
  'valve-2': '2',
  'valve-3': '3',
}

function keyRecipe(pressed: readonly ControlId[]): string {
  if (pressed.length === 0) return 'Everything open — no keys down.'
  return `Press ${pressed.map((id) => CONTROL_WORDS[id] ?? id).join(' + ')}.`
}

function valveRecipe(pressed: readonly ValveControlId[]): string {
  if (pressed.length === 0) return 'Open — no valves down.'
  return `Valve${pressed.length > 1 ? 's' : ''} ${pressed
    .map((id) => CONTROL_WORDS[id] ?? id)
    .join(' + ')}.`
}

function holeRecipe(covered: readonly RecorderControlId[]): string {
  if (covered.length === 0) return 'Every hole open.'
  const front = covered.filter((id) => id !== 'thumb').map((id) => id.replace('hole-', ''))
  const parts: string[] = []
  if (covered.includes('thumb')) parts.push('the thumb hole')
  if (front.length) parts.push(`holes ${front.join(', ')}`)
  return `Cover ${parts.join(' and ')}.`
}

/* ── Course builders ──────────────────────────────────────────────────── */

/** Written MIDI → the controls held down for that note. */
type KeyTable = Readonly<Record<number, readonly WoodwindControlId[]>>
type ValveTable = Readonly<Record<number, readonly ValveControlId[]>>
type SlideTable = Readonly<Record<number, SlidePosition>>
type HoleTable = Readonly<
  Record<number, { covered: readonly RecorderControlId[]; half?: readonly RecorderControlId[] }>
>

interface BuildOptions {
  prefix: string
  midis: readonly number[]
  spelling?: 'flat' | 'sharp'
  /** Overrides the automatic spelling for a note that belongs in a key. */
  spellSharp?: readonly number[]
  detail?: string
}

function buildKeyNotes(table: KeyTable, options: BuildOptions): LessonNote[] {
  return options.midis.map((midi) => {
    const pressed = table[midi] ?? []
    const pitch = staffPitchFor(
      midi,
      options.spellSharp?.includes(midi) ? 'sharp' : (options.spelling ?? 'flat'),
    )
    const label = labelFor(pitch)
    return {
      id: `${options.prefix}-${midi}`,
      writtenMidi: midi,
      writtenLabel: label,
      staff: pitch,
      fingering: { kind: 'keys', pressed },
      recipe: keyRecipe(pressed),
      detail: options.detail ?? 'Keep the air steady and every covered key sealed.',
    }
  })
}

function buildValveNotes(table: ValveTable, options: BuildOptions): LessonNote[] {
  return options.midis.map((midi) => {
    const pressed = table[midi] ?? []
    const pitch = staffPitchFor(
      midi,
      options.spellSharp?.includes(midi) ? 'sharp' : (options.spelling ?? 'flat'),
    )
    return {
      id: `${options.prefix}-${midi}`,
      writtenMidi: midi,
      writtenLabel: labelFor(pitch),
      staff: pitch,
      fingering: { kind: 'valves', pressed },
      recipe: valveRecipe(pressed),
      detail: options.detail ?? 'Let the air do the work — the valves only change the tubing.',
    }
  })
}

function buildSlideNotes(table: SlideTable, options: BuildOptions): LessonNote[] {
  return options.midis.map((midi) => {
    const position = table[midi] ?? 1
    const pitch = staffPitchFor(
      midi,
      options.spellSharp?.includes(midi) ? 'sharp' : (options.spelling ?? 'flat'),
    )
    return {
      id: `${options.prefix}-${midi}`,
      writtenMidi: midi,
      writtenLabel: labelFor(pitch),
      staff: pitch,
      fingering: { kind: 'slide', position, control: `slide-${position}` },
      recipe: `Slide position ${position}.`,
      detail: options.detail ?? 'Move the slide in one smooth motion and keep the air flowing.',
    }
  })
}

function buildHoleNotes(table: HoleTable, options: BuildOptions): LessonNote[] {
  return options.midis.map((midi) => {
    const entry = table[midi] ?? { covered: [] }
    const pitch = staffPitchFor(
      midi,
      options.spellSharp?.includes(midi) ? 'sharp' : (options.spelling ?? 'flat'),
    )
    return {
      id: `${options.prefix}-${midi}`,
      writtenMidi: midi,
      writtenLabel: labelFor(pitch),
      staff: pitch,
      fingering: {
        kind: 'holes',
        covered: entry.covered,
        closed: entry.covered,
        ...(entry.half ? { halfClosed: entry.half } : {}),
      },
      recipe: holeRecipe(entry.covered),
      detail: options.detail ?? 'Seal each hole with the pad of the finger and blow gently.',
    }
  })
}

/** Every semitone from `low` to `high`, inclusive. */
function range(low: number, high: number): number[] {
  return Array.from({ length: high - low + 1 }, (_, index) => low + index)
}

/* ── Flute ────────────────────────────────────────────────────────────────
   Transcribed from the Woodwind Fingering Guide's basic charts. The right
   pinky's E♭ key is down for every note except D natural, which is the one
   note whose tone hole it would open.
─────────────────────────────────────────────────────────────────────────── */

const FL_ALL: readonly WoodwindControlId[] = [
  'thumb',
  'lh-1',
  'lh-2',
  'lh-3',
  'rh-1',
  'rh-2',
  'rh-3',
]

const FLUTE_KEYS: KeyTable = {
  60: [...FL_ALL, 'side-eb', 'foot-c'], // C4
  61: [...FL_ALL, 'side-eb', 'foot-csharp'],
  62: [...FL_ALL], // D4 — the one note without the E♭ key
  63: [...FL_ALL, 'side-eb'],
  64: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'rh-1', 'rh-2', 'side-eb'],
  65: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'rh-1', 'side-eb'],
  66: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'rh-3', 'side-eb'],
  67: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'side-eb'],
  68: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'key-gsharp', 'side-eb'],
  69: ['thumb', 'lh-1', 'lh-2', 'side-eb'],
  70: ['thumb', 'lh-1', 'rh-1', 'side-eb'], // B♭4 — "one and one"
  71: ['thumb', 'lh-1', 'side-eb'],
  72: ['lh-1', 'side-eb'], // C5 — thumb comes off
  73: ['side-eb'],
  74: ['thumb', 'lh-2', 'lh-3', 'rh-1', 'rh-2', 'rh-3'], // D5 — vented, no E♭
  75: ['thumb', 'lh-2', 'lh-3', 'rh-1', 'rh-2', 'rh-3', 'side-eb'],
  76: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'rh-1', 'rh-2', 'side-eb'],
  77: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'rh-1', 'side-eb'],
  78: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'rh-3', 'side-eb'],
  79: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'side-eb'],
  80: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'key-gsharp', 'side-eb'],
  81: ['thumb', 'lh-1', 'lh-2', 'side-eb'],
  82: ['thumb', 'lh-1', 'rh-1', 'side-eb'],
  83: ['thumb', 'lh-1', 'side-eb'],
  84: ['lh-1', 'side-eb'],
  85: ['side-eb'],
  86: ['thumb', 'lh-2', 'lh-3', 'side-eb'], // D6
  87: [...FL_ALL, 'key-gsharp', 'side-eb'],
  88: ['thumb', 'lh-1', 'lh-2', 'rh-1', 'rh-2', 'side-eb'],
  89: ['thumb', 'lh-1', 'lh-3', 'rh-1', 'side-eb'],
  90: ['thumb', 'lh-1', 'lh-3', 'rh-3', 'side-eb'],
  91: ['lh-1', 'lh-2', 'lh-3', 'side-eb'],
  92: ['lh-2', 'lh-3', 'key-gsharp', 'side-eb'],
  93: ['thumb', 'lh-2', 'rh-1', 'side-eb'],
  94: ['thumb', 'rh-1', 'trill-d'],
  95: ['thumb', 'lh-1', 'lh-3', 'trill-dsharp'],
  96: ['lh-1', 'lh-2', 'lh-3', 'rh-1', 'key-gsharp'], // C7
}

/* ── Clarinet ─────────────────────────────────────────────────────────────
   Chalumeau transcribed from the Woodwind Fingering Guide. The clarion is
   built from it rather than typed twice: a clarinet overblows a twelfth, so
   every clarion note is its chalumeau fingering plus the register key,
   nineteen semitones higher. That relationship is the instrument.
─────────────────────────────────────────────────────────────────────────── */

const CL_ALL: readonly WoodwindControlId[] = [
  'thumb',
  'lh-1',
  'lh-2',
  'lh-3',
  'rh-1',
  'rh-2',
  'rh-3',
]

const CLARINET_CHALUMEAU: KeyTable = {
  52: [...CL_ALL, 'lp-e'], // E3, the lowest note
  53: [...CL_ALL, 'pinky-f'],
  54: [...CL_ALL, 'rp-fsharp'],
  55: [...CL_ALL],
  56: [...CL_ALL, 'rp-ab'],
  57: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'rh-1', 'rh-2'],
  58: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'rh-1'],
  59: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'rh-2'], // forked B
  60: ['thumb', 'lh-1', 'lh-2', 'lh-3'],
  61: ['thumb', 'lh-1', 'lh-2', 'lh-3', 'lp-csharp'],
  62: ['thumb', 'lh-1', 'lh-2'],
  63: ['thumb', 'lh-1', 'lh-2', 'side-1'], // throat E♭ on the top side key
  64: ['thumb', 'lh-1'],
  65: ['thumb'],
  66: ['side-3', 'side-4'], // throat F♯
  67: [], // throat G — everything open
  68: ['key-gsharp'],
  69: ['key-a'],
  70: ['key-a', 'octave'], // throat B♭ uses the register key as a tone hole
}

/** Clarion notes are the chalumeau fingering plus the register key. */
const CLARINET_KEYS: KeyTable = (() => {
  const table: Record<number, readonly WoodwindControlId[]> = { ...CLARINET_CHALUMEAU }
  for (let midi = 71; midi <= 84; midi += 1) {
    const below = CLARINET_CHALUMEAU[midi - 19]
    if (below) table[midi] = ['octave', ...below]
  }
  return table
})()

/* ── Saxophone ────────────────────────────────────────────────────────────
   One set of fingerings serves both saxes; only the transposition differs.
   The upper octave repeats the lower one with the octave key added, which is
   exactly how the instrument is built.
─────────────────────────────────────────────────────────────────────────── */

const SX_ALL: readonly WoodwindControlId[] = [
  'lh-1',
  'lh-2',
  'lh-3',
  'rh-1',
  'rh-2',
  'rh-3',
]

const SAX_LOW: KeyTable = {
  58: [...SX_ALL, 'lp-bb'], // written B♭3, the bottom of the horn
  59: [...SX_ALL, 'lp-b'],
  60: [...SX_ALL, 'rp-c'],
  61: [...SX_ALL, 'lp-csharp'],
  62: [...SX_ALL],
  63: [...SX_ALL, 'rp-eb'],
  64: ['lh-1', 'lh-2', 'lh-3', 'rh-1', 'rh-2'],
  65: ['lh-1', 'lh-2', 'lh-3', 'rh-1'],
  66: ['lh-1', 'lh-2', 'lh-3', 'rh-2'], // F♯ with the middle finger
  67: ['lh-1', 'lh-2', 'lh-3'],
  68: ['lh-1', 'lh-2', 'lh-3', 'lp-gsharp'],
  69: ['lh-1', 'lh-2'],
  70: ['lh-1', 'bis'], // B♭ on the bis key
  71: ['lh-1'],
  72: ['lh-2'], // C with the middle finger alone
  73: ['lh-1', 'side-c'],
}

/** Everything from D5 up repeats the low fingering with the octave key. */
const SAX_KEYS: KeyTable = (() => {
  const table: Record<number, readonly WoodwindControlId[]> = { ...SAX_LOW }
  for (let midi = 74; midi <= 89; midi += 1) {
    const below = SAX_LOW[midi - 12]
    if (below) table[midi] = ['octave', ...below]
  }
  // Palm keys carry the top of the range.
  table[86] = ['octave', 'lh-1', 'lh-2', 'lh-3', 'palm-d']
  table[87] = ['octave', 'lh-1', 'lh-2', 'lh-3', 'palm-d', 'palm-eb']
  table[88] = ['octave', 'lh-1', 'lh-2', 'lh-3', 'palm-d', 'palm-eb', 'palm-f']
  table[89] = ['octave', 'lh-1', 'lh-2', 'palm-d', 'palm-eb', 'palm-f']
  table[90] = ['octave', 'lh-1', 'lh-2', 'lh-3', 'side-f-sharp']
  return table
})()

/* ── Recorder ─────────────────────────────────────────────────────────────
   Baroque (English) fingering for a soprano, written an octave below sounding
   the way method books print it. The upper register is reached by pinching
   the thumb hole, which the chart shows as a half-covered thumb.
─────────────────────────────────────────────────────────────────────────── */

const RC_ALL: readonly RecorderControlId[] = [
  'thumb',
  'hole-1',
  'hole-2',
  'hole-3',
  'hole-4',
  'hole-5',
  'hole-6',
  'hole-7',
]

const RECORDER_HOLES: HoleTable = {
  60: { covered: RC_ALL },
  61: { covered: RC_ALL.slice(0, 7) as RecorderControlId[], half: ['hole-7'] },
  62: { covered: RC_ALL.slice(0, 7) as RecorderControlId[] },
  63: { covered: ['thumb', 'hole-1', 'hole-2', 'hole-3', 'hole-4', 'hole-5', 'hole-7'] },
  64: { covered: ['thumb', 'hole-1', 'hole-2', 'hole-3', 'hole-4', 'hole-5'] },
  65: { covered: ['thumb', 'hole-1', 'hole-2', 'hole-3', 'hole-4', 'hole-6', 'hole-7'] },
  66: { covered: ['thumb', 'hole-1', 'hole-2', 'hole-3', 'hole-4'] },
  67: { covered: ['thumb', 'hole-1', 'hole-2', 'hole-3'] },
  68: { covered: ['thumb', 'hole-1', 'hole-2', 'hole-3', 'hole-5', 'hole-6'] },
  69: { covered: ['thumb', 'hole-1', 'hole-2'] },
  70: { covered: ['thumb', 'hole-1', 'hole-3', 'hole-4'] },
  71: { covered: ['thumb', 'hole-1'] },
  72: { covered: ['thumb', 'hole-2'] },
  73: { covered: ['hole-2'] },
  74: { covered: ['hole-1', 'hole-2'], half: ['thumb'] },
  75: { covered: ['hole-1', 'hole-2', 'hole-3', 'hole-4', 'hole-5'], half: ['thumb'] },
  76: { covered: ['hole-1', 'hole-2', 'hole-3', 'hole-4', 'hole-6'], half: ['thumb'] },
  77: { covered: ['hole-1', 'hole-2', 'hole-3', 'hole-5', 'hole-6'], half: ['thumb'] },
  78: { covered: ['hole-1', 'hole-2', 'hole-3', 'hole-5'], half: ['thumb'] },
  79: { covered: ['hole-1', 'hole-2', 'hole-3'], half: ['thumb'] },
  80: { covered: ['hole-1', 'hole-2', 'hole-4', 'hole-5'], half: ['thumb'] },
  81: { covered: ['hole-1', 'hole-2', 'hole-4'], half: ['thumb'] },
  82: { covered: ['hole-1', 'hole-3', 'hole-4'], half: ['thumb'] },
  83: { covered: ['hole-1', 'hole-2', 'hole-3', 'hole-4', 'hole-5'], half: ['thumb'] },
  84: { covered: ['hole-1', 'hole-2', 'hole-4', 'hole-5'], half: ['thumb'] },
}

/* ── Brass ────────────────────────────────────────────────────────────────
   Valve combinations and slide positions are not a table anyone has to
   remember: each one is the number of semitones the note sits below its open
   partial. These are generated from that rule, which is why they agree with
   every printed chart.
─────────────────────────────────────────────────────────────────────────── */

/** Semitones below the partial → valves down. Seven usable combinations. */
const VALVE_BY_DROP: readonly (readonly ValveControlId[])[] = [
  [],
  ['valve-2'],
  ['valve-1'],
  ['valve-1', 'valve-2'],
  ['valve-2', 'valve-3'],
  ['valve-1', 'valve-3'],
  ['valve-1', 'valve-2', 'valve-3'],
]

/**
 * Open partials, written, for a three-valve B♭ brass instrument. Each note is
 * played on the lowest partial that can reach it, which is what a chart
 * prints as the standard fingering.
 */
function brassFingerings(
  partials: readonly number[],
  low: number,
  high: number,
): { valves: ValveTable; slides: SlideTable } {
  const valves: Record<number, readonly ValveControlId[]> = {}
  const slides: Record<number, SlidePosition> = {}
  for (let midi = low; midi <= high; midi += 1) {
    // The best partial is the lowest one no more than six semitones above.
    const partial = partials.find((p) => p >= midi && p - midi <= 6)
    const drop = partial === undefined ? 0 : partial - midi
    valves[midi] = VALVE_BY_DROP[drop] ?? []
    slides[midi] = (drop + 1) as SlidePosition
  }
  return { valves, slides }
}

/** Written open partials for the B♭ trumpet. */
const TRUMPET_PARTIALS = [60, 67, 72, 76, 79, 82, 84]
/** Concert open partials for trombone, baritone and euphonium. */
const LOW_BRASS_PARTIALS = [46, 53, 58, 62, 65, 70, 72]
/** Concert open partials for the BB♭ tuba, an octave below. */
const TUBA_PARTIALS = [34, 41, 46, 50, 53, 58, 60]

const TRUMPET = brassFingerings(TRUMPET_PARTIALS, 54, 84)
const LOW_BRASS = brassFingerings(LOW_BRASS_PARTIALS, 40, 70)
const TUBA = brassFingerings(TUBA_PARTIALS, 28, 58)

/* ── The instruments ──────────────────────────────────────────────────────
   Each beginner course is one octave of the concert B♭ major scale, written
   where that instrument reads it. Play them side by side and they are the
   same eight concert pitches.
─────────────────────────────────────────────────────────────────────────── */

const BEGINNER_BLURB = 'Concert B♭ major · the first scale every band method teaches'

function course(
  id: string,
  title: string,
  description: string,
  notes: readonly LessonNote[],
): Course {
  return { version: LESSON_DATA_VERSION, id, title, description, notes }
}

export const INSTRUMENTS = [
  {
    id: 'flute',
    name: 'Flute',
    shortName: 'Flute',
    family: 'woodwind',
    clef: 'treble',
    transpositionSemitones: 0,
    chartKind: 'flute',
    courses: {
      beginner: course(
        'flute-beginner-v2',
        'First 8 notes',
        BEGINNER_BLURB,
        buildKeyNotes(FLUTE_KEYS, {
          prefix: 'flute-beg',
          midis: [70, 72, 74, 75, 77, 79, 81, 82],
          detail: 'Aim a narrow, steady air stream and keep every covered key sealed.',
        }),
      ),
      chromatic: course(
        'flute-chromatic-v2',
        'Every note',
        'C4 to C7 · every semitone',
        buildKeyNotes(FLUTE_KEYS, { prefix: 'flute-chr', midis: range(60, 96) }),
      ),
    },
  },
  {
    id: 'bb-clarinet',
    name: 'B♭ Clarinet',
    shortName: 'Clarinet',
    family: 'woodwind',
    clef: 'treble',
    transpositionSemitones: -2,
    chartKind: 'clarinet',
    courses: {
      beginner: course(
        'bb-clarinet-beginner-v2',
        'First 8 notes',
        BEGINNER_BLURB,
        buildKeyNotes(CLARINET_KEYS, {
          prefix: 'clar-beg',
          midis: [60, 62, 64, 65, 67, 69, 71, 72],
          detail: 'Seal every ring completely; the last two notes cross the break.',
        }),
      ),
      chromatic: course(
        'bb-clarinet-chromatic-v2',
        'Every note',
        'Written E3 to C6 · chalumeau through clarion',
        buildKeyNotes(CLARINET_KEYS, { prefix: 'clar-chr', midis: range(52, 84) }),
      ),
    },
  },
  {
    id: 'alto-sax',
    name: 'E♭ Alto Saxophone',
    shortName: 'Alto Sax',
    family: 'woodwind',
    clef: 'treble',
    transpositionSemitones: -9,
    chartKind: 'saxophone',
    courses: {
      beginner: course(
        'alto-sax-beginner-v2',
        'First 8 notes',
        BEGINNER_BLURB,
        buildKeyNotes(SAX_KEYS, {
          prefix: 'alto-beg',
          midis: [67, 69, 71, 72, 74, 76, 78, 79],
          spellSharp: [78],
          detail: 'Keep the left thumb relaxed on the octave key and the air moving.',
        }),
      ),
      chromatic: course(
        'alto-sax-chromatic-v2',
        'Every note',
        'Written B♭3 to F♯6 · the full horn',
        buildKeyNotes(SAX_KEYS, { prefix: 'alto-chr', midis: range(58, 90) }),
      ),
    },
  },
  {
    id: 'tenor-sax',
    name: 'B♭ Tenor Saxophone',
    shortName: 'Tenor Sax',
    family: 'woodwind',
    clef: 'treble',
    transpositionSemitones: -14,
    chartKind: 'saxophone',
    courses: {
      beginner: course(
        'tenor-sax-beginner-v2',
        'First 8 notes',
        BEGINNER_BLURB,
        buildKeyNotes(SAX_KEYS, {
          prefix: 'tenor-beg',
          midis: [60, 62, 64, 65, 67, 69, 71, 72],
          detail: 'Open the throat and let the horn speak; do not bite the reed.',
        }),
      ),
      chromatic: course(
        'tenor-sax-chromatic-v2',
        'Every note',
        'Written B♭3 to F♯6 · the full horn',
        buildKeyNotes(SAX_KEYS, { prefix: 'tenor-chr', midis: range(58, 90) }),
      ),
    },
  },
  {
    id: 'bb-trumpet',
    name: 'B♭ Trumpet',
    shortName: 'Trumpet',
    family: 'brass',
    clef: 'treble',
    transpositionSemitones: -2,
    chartKind: 'valves',
    courses: {
      beginner: course(
        'bb-trumpet-beginner-v2',
        'First 8 notes',
        BEGINNER_BLURB,
        buildValveNotes(TRUMPET.valves, {
          prefix: 'tpt-beg',
          midis: [60, 62, 64, 65, 67, 69, 71, 72],
          detail: 'Keep a relaxed buzz and steady air through every valve change.',
        }),
      ),
      chromatic: course(
        'bb-trumpet-chromatic-v2',
        'Every note',
        'Written F♯3 to C6 · every semitone',
        buildValveNotes(TRUMPET.valves, { prefix: 'tpt-chr', midis: range(54, 84) }),
      ),
    },
  },
  {
    id: 'trombone',
    name: 'Tenor Trombone',
    shortName: 'Trombone',
    family: 'brass',
    clef: 'bass',
    transpositionSemitones: 0,
    chartKind: 'slide',
    courses: {
      beginner: course(
        'trombone-beginner-v2',
        'First 8 notes',
        BEGINNER_BLURB,
        buildSlideNotes(LOW_BRASS.slides, {
          prefix: 'tbn-beg',
          midis: [46, 48, 50, 51, 53, 55, 57, 58],
          detail: 'Move the slide in one motion and keep the air going through it.',
        }),
      ),
      chromatic: course(
        'trombone-chromatic-v2',
        'Every note',
        'E2 to B♭4 · every semitone',
        buildSlideNotes(LOW_BRASS.slides, { prefix: 'tbn-chr', midis: range(40, 70) }),
      ),
    },
  },
  {
    id: 'baritone',
    name: 'Baritone / Euphonium',
    shortName: 'Baritone',
    family: 'brass',
    clef: 'bass',
    transpositionSemitones: 0,
    chartKind: 'valves',
    courses: {
      beginner: course(
        'baritone-beginner-v2',
        'First 8 notes',
        BEGINNER_BLURB,
        buildValveNotes(LOW_BRASS.valves, {
          prefix: 'bar-beg',
          midis: [46, 48, 50, 51, 53, 55, 57, 58],
          detail: 'Use warm, full air and let the valves move without tension.',
        }),
      ),
      chromatic: course(
        'baritone-chromatic-v2',
        'Every note',
        'E2 to B♭4 · every semitone',
        buildValveNotes(LOW_BRASS.valves, { prefix: 'bar-chr', midis: range(40, 70) }),
      ),
    },
  },
  {
    id: 'tuba',
    name: 'BB♭ Tuba',
    shortName: 'Tuba',
    family: 'brass',
    clef: 'bass',
    transpositionSemitones: 0,
    chartKind: 'valves',
    courses: {
      beginner: course(
        'tuba-beginner-v2',
        'First 8 notes',
        BEGINNER_BLURB,
        buildValveNotes(TUBA.valves, {
          prefix: 'tuba-beg',
          midis: [34, 36, 38, 39, 41, 43, 45, 46],
          detail: 'Take a big, low breath and keep the throat open on every note.',
        }),
      ),
      chromatic: course(
        'tuba-chromatic-v2',
        'Every note',
        'E1 to B♭3 · every semitone',
        buildValveNotes(TUBA.valves, { prefix: 'tuba-chr', midis: range(28, 58) }),
      ),
    },
  },
  {
    id: 'soprano-recorder',
    name: 'Soprano Recorder',
    shortName: 'Recorder',
    family: 'woodwind',
    clef: 'treble',
    transpositionSemitones: 12,
    chartKind: 'recorder',
    courses: {
      beginner: course(
        'soprano-recorder-beginner-v2',
        'First 8 notes',
        'C major · the recorder’s home octave',
        buildHoleNotes(RECORDER_HOLES, {
          prefix: 'rec-beg',
          midis: [60, 62, 64, 65, 67, 69, 71, 72],
          detail: 'Seal each hole with the finger pad and use gentle, warm air.',
        }),
      ),
      chromatic: course(
        'soprano-recorder-chromatic-v2',
        'Every note',
        'Written C4 to C6 · baroque fingering',
        buildHoleNotes(RECORDER_HOLES, { prefix: 'rec-chr', midis: range(60, 84) }),
      ),
    },
  },
] as const satisfies readonly Instrument[]

export interface InstrumentGroup {
  id: InstrumentFamily
  label: string
  instrumentIds: readonly InstrumentId[]
}

export const INSTRUMENT_GROUPS = [
  {
    id: 'woodwind',
    label: 'Woodwinds',
    instrumentIds: ['flute', 'bb-clarinet', 'alto-sax', 'tenor-sax', 'soprano-recorder'],
  },
  {
    id: 'brass',
    label: 'Brass',
    instrumentIds: ['bb-trumpet', 'trombone', 'baritone', 'tuba'],
  },
] as const satisfies readonly InstrumentGroup[]

export function getInstrument(id: string): Instrument | undefined {
  return INSTRUMENTS.find((instrument) => instrument.id === id)
}

/* ── Goals ─────────────────────────────────────────────────────────────
   A goal picks which set of notes the run uses and what order they arrive
   in. Nothing else about the lesson changes, so a student who can play the
   first eight can step straight into the chromatic run.
──────────────────────────────────────────────────────────────────────── */

export type GoalId = 'first-notes' | 'shuffle' | 'chromatic'

export interface LessonGoal {
  id: GoalId
  title: string
  /** One line a beginner can act on, not a feature description. */
  description: string
  course: CourseId
  order: 'in-order' | 'shuffle'
}

export const LESSON_GOALS = [
  {
    id: 'first-notes',
    title: 'My first 8 notes',
    description: 'The notes a beginner band book starts with, up the scale.',
    course: 'beginner',
    order: 'in-order',
  },
  {
    id: 'shuffle',
    title: 'Mix them up',
    description: 'The same 8 notes in random order.',
    course: 'beginner',
    order: 'shuffle',
  },
  {
    id: 'chromatic',
    title: 'Every note I can play',
    description: 'Chromatic, bottom to top of your whole range.',
    course: 'chromatic',
    order: 'in-order',
  },
] as const satisfies readonly LessonGoal[]

export function getLessonGoal(id: string): LessonGoal | undefined {
  return LESSON_GOALS.find((goal) => goal.id === id)
}

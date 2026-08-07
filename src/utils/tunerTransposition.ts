import { midiToNoteName, type PitchReadout } from './pitchUtils'

/**
 * A written-pitch preset. `writtenOffsetSemitones` is added to sounding MIDI
 * so the tuner can show the note the player sees on the page while cents and
 * frequency remain anchored to the microphone's concert pitch.
 */
export type TunerTranspositionId =
  | 'concert'
  | 'c_octave_up'
  | 'c_two_octaves_up'
  | 'c_octave_down'
  | 'bb'
  | 'bb_octave'
  | 'bb_two_octaves'
  | 'eb_high'
  | 'eb'
  | 'eb_octave'
  | 'f'
  | 'g'
  | 'a'
  | 'd_high'

export type TunerTranspositionGroup =
  | 'Concert & octave instruments'
  | 'B♭ instruments'
  | 'E♭ instruments'
  | 'Other keys'

export interface TunerTranspositionOption {
  id: TunerTranspositionId
  label: string
  shortLabel: string
  keyLabel: string
  detail: string
  group: TunerTranspositionGroup
  writtenOffsetSemitones: number
}

export const DEFAULT_TUNER_TRANSPOSITION: TunerTranspositionId = 'concert'

/**
 * Common orchestral, concert-band, brass-band, jazz, and rhythm-section
 * transpositions. Instruments that share both key and octave are combined so
 * the picker remains useful on a phone rather than becoming a duplicate list.
 */
export const TUNER_TRANSPOSITION_OPTIONS: readonly TunerTranspositionOption[] = [
  {
    id: 'concert',
    label: 'Concert pitch (C)',
    shortLabel: 'Concert',
    keyLabel: 'C',
    detail: 'Voice, piano, flute, oboe, bassoon, trombone, tuba, and bowed strings',
    group: 'Concert & octave instruments',
    writtenOffsetSemitones: 0,
  },
  {
    id: 'c_octave_up',
    label: 'Piccolo / celesta (C)',
    shortLabel: 'C ·8va up',
    keyLabel: 'C ·8va',
    detail: 'Sounds one octave above the written note',
    group: 'Concert & octave instruments',
    writtenOffsetSemitones: -12,
  },
  {
    id: 'c_two_octaves_up',
    label: 'Glockenspiel (C)',
    shortLabel: 'C ·15ma up',
    keyLabel: 'C ·15ma',
    detail: 'Sounds two octaves above the written note',
    group: 'Concert & octave instruments',
    writtenOffsetSemitones: -24,
  },
  {
    id: 'c_octave_down',
    label: 'Guitar / bass (C)',
    shortLabel: 'C ·8va down',
    keyLabel: 'C ·−8va',
    detail: 'Guitar, electric bass, double bass, and tenor voice notation',
    group: 'Concert & octave instruments',
    writtenOffsetSemitones: 12,
  },
  {
    id: 'bb',
    label: 'B♭ clarinet / trumpet',
    shortLabel: 'B♭',
    keyLabel: 'B♭',
    detail: 'Clarinet, trumpet, cornet, flugelhorn, and soprano saxophone',
    group: 'B♭ instruments',
    writtenOffsetSemitones: 2,
  },
  {
    id: 'bb_octave',
    label: 'Tenor sax / bass clarinet',
    shortLabel: 'B♭ ·−8va',
    keyLabel: 'B♭ ·−8va',
    detail: 'Also euphonium and baritone horn when reading treble clef',
    group: 'B♭ instruments',
    writtenOffsetSemitones: 14,
  },
  {
    id: 'bb_two_octaves',
    label: 'Bass sax / contrabass clarinet',
    shortLabel: 'B♭ ·−15ma',
    keyLabel: 'B♭ ·−15ma',
    detail: 'Also B♭ brass-band bass when reading treble clef',
    group: 'B♭ instruments',
    writtenOffsetSemitones: 26,
  },
  {
    id: 'eb_high',
    label: 'E♭ clarinet / E♭ trumpet',
    shortLabel: 'E♭ ·up',
    keyLabel: 'E♭ ·up',
    detail: 'Sounds a minor third above the written note',
    group: 'E♭ instruments',
    writtenOffsetSemitones: -3,
  },
  {
    id: 'eb',
    label: 'Alto sax / alto clarinet',
    shortLabel: 'E♭',
    keyLabel: 'E♭',
    detail: 'Also E♭ tenor horn and E♭ alto horn',
    group: 'E♭ instruments',
    writtenOffsetSemitones: 9,
  },
  {
    id: 'eb_octave',
    label: 'Baritone sax / contralto clarinet',
    shortLabel: 'E♭ ·−8va',
    keyLabel: 'E♭ ·−8va',
    detail: 'Also E♭ brass-band bass when reading treble clef',
    group: 'E♭ instruments',
    writtenOffsetSemitones: 21,
  },
  {
    id: 'f',
    label: 'Horn / English horn (F)',
    shortLabel: 'F',
    keyLabel: 'F',
    detail: 'French horn, English horn, basset horn, and F alto recorder notation',
    group: 'Other keys',
    writtenOffsetSemitones: 7,
  },
  {
    id: 'g',
    label: 'Alto flute (G)',
    shortLabel: 'G',
    keyLabel: 'G',
    detail: 'Sounds a perfect fourth below the written note',
    group: 'Other keys',
    writtenOffsetSemitones: 5,
  },
  {
    id: 'a',
    label: 'A clarinet',
    shortLabel: 'A',
    keyLabel: 'A',
    detail: 'Sounds a minor third below the written note',
    group: 'Other keys',
    writtenOffsetSemitones: 3,
  },
  {
    id: 'd_high',
    label: 'D trumpet',
    shortLabel: 'D ·up',
    keyLabel: 'D ·up',
    detail: 'Sounds a whole step above the written note',
    group: 'Other keys',
    writtenOffsetSemitones: -2,
  },
] as const

const TRANSPOSITION_BY_ID = new Map(
  TUNER_TRANSPOSITION_OPTIONS.map((option) => [option.id, option]),
)

export const TUNER_TRANSPOSITION_GROUPS: readonly TunerTranspositionGroup[] = [
  'Concert & octave instruments',
  'B♭ instruments',
  'E♭ instruments',
  'Other keys',
]

export function isTunerTranspositionId(value: unknown): value is TunerTranspositionId {
  return typeof value === 'string' && TRANSPOSITION_BY_ID.has(value as TunerTranspositionId)
}

export function getTunerTransposition(
  id: TunerTranspositionId,
): TunerTranspositionOption {
  return (
    TRANSPOSITION_BY_ID.get(id) ??
    TRANSPOSITION_BY_ID.get(DEFAULT_TUNER_TRANSPOSITION)!
  )
}

/** Convert a written MIDI target into the sounding concert MIDI note. */
export function writtenMidiToConcertMidi(
  writtenMidi: number,
  transposition: TunerTranspositionId,
): number {
  return Math.round(writtenMidi) - getTunerTransposition(transposition).writtenOffsetSemitones
}

/** Convert a sounding concert MIDI note into its written MIDI equivalent. */
export function concertMidiToWrittenMidi(
  concertMidi: number,
  transposition: TunerTranspositionId,
): number {
  return Math.round(concertMidi) + getTunerTransposition(transposition).writtenOffsetSemitones
}

const WRITTEN_PITCH_CLASS_LABELS = [
  'C',
  'C♯',
  'D',
  'E♭',
  'E',
  'F',
  'F♯',
  'G',
  'A♭',
  'A',
  'B♭',
  'B',
] as const

export interface WrittenPitchLabel {
  /** MIDI note after applying the selected instrument's written-pitch offset. */
  midi: number
  pitchClass: number
  octave: number
  label: string
  noteName: string
}

/**
 * Label a sounding concert note as the note the selected instrument reads.
 * This is deliberately display-only: callers keep the original concert
 * pitch class and octave when starting or changing audio.
 */
export function getWrittenPitchLabel(
  concertPitchClass: number,
  concertOctave: number,
  transposition: TunerTranspositionId,
): WrittenPitchLabel {
  const normalizedPitchClass =
    ((Math.round(concertPitchClass) % 12) + 12) % 12
  const concertMidi = (Math.round(concertOctave) + 1) * 12 + normalizedPitchClass
  const writtenMidi =
    concertMidi + getTunerTransposition(transposition).writtenOffsetSemitones
  const writtenPitchClass = ((writtenMidi % 12) + 12) % 12
  const writtenOctave = Math.floor(writtenMidi / 12) - 1
  const label = WRITTEN_PITCH_CLASS_LABELS[writtenPitchClass]

  return {
    midi: writtenMidi,
    pitchClass: writtenPitchClass,
    octave: writtenOctave,
    label,
    noteName: `${label}${writtenOctave}`,
  }
}

/** Convert a concert-pitch detection into the instrument's written note. */
export function transposePitchReadout(
  readout: PitchReadout,
  transposition: TunerTranspositionId,
): PitchReadout {
  if (readout.noteName === '—' || !Number.isFinite(readout.midi)) return readout

  const semitones = getTunerTransposition(transposition).writtenOffsetSemitones
  if (semitones === 0) return readout

  const writtenMidi = readout.midi + semitones
  return {
    ...readout,
    midi: writtenMidi,
    noteName: midiToNoteName(writtenMidi),
  }
}

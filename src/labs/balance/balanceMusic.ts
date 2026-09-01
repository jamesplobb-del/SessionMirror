import { writtenMidiToConcertMidi } from '../../utils/tunerTransposition'
import { getBalanceInstrument } from './balanceInstruments'
import type {
  BalanceCustomRoutine,
  BalanceInstrument,
  BalanceScaleDirection,
  BalanceScaleRoutineSettings,
  BalanceScaleType,
  BalanceSettings,
  BalanceTarget,
} from './balanceTypes'

const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

export {
  BALANCE_INSTRUMENTS,
  clampWrittenMidi,
  getBalanceInstrument,
  inferBalanceInstrument,
  resolveBalanceInstrumentId,
} from './balanceInstruments'

const SCALE_INTERVALS: Record<Exclude<BalanceScaleType, 'melodicMinor'>, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10, 12],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11, 12],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
}

const MELODIC_MINOR_ASCENDING = [0, 2, 3, 5, 7, 9, 11, 12] as const
const MELODIC_MINOR_DESCENDING = [12, 10, 8, 7, 5, 3, 2, 0] as const

export const BALANCE_SCALE_TYPE_LABELS: Record<BalanceScaleType, string> = {
  major: 'Major',
  naturalMinor: 'Natural minor',
  harmonicMinor: 'Harmonic minor',
  melodicMinor: 'Melodic minor',
  chromatic: 'Chromatic',
}

export const BALANCE_DIRECTION_LABELS: Record<BalanceScaleDirection, string> = {
  ascending: 'Ascending',
  descending: 'Descending',
  upDown: 'Up and down',
}

function prefersFlats(midi: number): boolean {
  return [1, 3, 8, 10].includes(((midi % 12) + 12) % 12)
}

export function midiToBalanceNoteName(midi: number, flats = prefersFlats(midi)): string {
  const rounded = Math.round(midi)
  const pitchClass = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return `${(flats ? FLAT_NAMES : SHARP_NAMES)[pitchClass]}${octave}`
}

export interface BalanceNoteSpelling {
  letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
  accidental: 'flat' | 'sharp' | null
  octave: number
}

/**
 * The written spelling behind a note name, split into the parts notation needs.
 *
 * Shares `prefersFlats` with `midiToBalanceNoteName`, so the letter the staff
 * puts a notehead on is always the letter the label prints. Deriving the staff
 * position from MIDI independently would sit B♭ on the A line with a sharp
 * beside it while the card overhead said "B♭".
 */
export function balanceNoteSpelling(midi: number): BalanceNoteSpelling {
  const rounded = Math.round(midi)
  const pitchClass = ((rounded % 12) + 12) % 12
  const name = (prefersFlats(rounded) ? FLAT_NAMES : SHARP_NAMES)[pitchClass]!
  return {
    letter: name[0] as BalanceNoteSpelling['letter'],
    accidental: name.includes('♭') ? 'flat' : name.includes('♯') ? 'sharp' : null,
    octave: Math.floor(rounded / 12) - 1,
  }
}

function octaveIntervals(base: readonly number[], octaves: 1 | 2): number[] {
  if (octaves === 1) return [...base]
  return [...base.slice(0, -1), ...base.map((interval) => interval + 12)]
}

function ascendingIntervals(type: BalanceScaleType, octaves: 1 | 2): number[] {
  const base = type === 'melodicMinor' ? MELODIC_MINOR_ASCENDING : SCALE_INTERVALS[type]
  return octaveIntervals(base, octaves)
}

function descendingIntervals(type: BalanceScaleType, octaves: 1 | 2): number[] {
  if (type !== 'melodicMinor') return ascendingIntervals(type, octaves).reverse()
  if (octaves === 1) return [...MELODIC_MINOR_DESCENDING]
  const high = MELODIC_MINOR_DESCENDING.map((interval) => interval + 12)
  return [...high.slice(0, -1), ...MELODIC_MINOR_DESCENDING]
}

export function buildBalanceScaleWrittenMidi(settings: BalanceScaleRoutineSettings): number[] {
  const ascending = ascendingIntervals(settings.scaleType, settings.octaveRange)
  const descending = descendingIntervals(settings.scaleType, settings.octaveRange)
  let onePass: number[]
  if (settings.direction === 'ascending') onePass = ascending
  else if (settings.direction === 'descending') onePass = descending
  else onePass = [...ascending, ...descending.slice(1)]

  const notes = onePass.map((interval) => settings.rootWrittenMidi + interval)
  return Array.from({ length: settings.repetitions }, () => notes).flat()
}

/**
 * Turn a written-pitch list into scored targets. Sky Trail levels and the
 * daily challenge hand their notes straight to this rather than round-tripping
 * through a saved custom routine.
 */
export function buildBalanceTargetsFromWritten(
  written: readonly number[],
  instrument: BalanceInstrument,
): BalanceTarget[] {
  return written.map((writtenMidi, sequenceIndex) => {
    const concertMidi = writtenMidiToConcertMidi(writtenMidi, instrument.transposition)
    return {
      id: `${sequenceIndex}-${writtenMidi}`,
      sequenceIndex,
      instrumentId: instrument.id,
      writtenMidi,
      concertMidi,
      writtenLabel: midiToBalanceNoteName(writtenMidi),
      concertLabel: midiToBalanceNoteName(concertMidi),
    }
  })
}

export function buildBalanceTargets(
  settings: BalanceSettings,
  customRoutines: readonly BalanceCustomRoutine[],
): BalanceTarget[] {
  const instrument = getBalanceInstrument(settings.instrumentId)
  let written: number[]
  if (settings.routineType === 'single') {
    written = Array.from({ length: settings.single.repetitions }, () => settings.single.writtenMidi)
  } else if (settings.routineType === 'scale') {
    written = buildBalanceScaleWrittenMidi(settings.scale)
  } else {
    written =
      customRoutines.find((routine) => routine.id === settings.selectedCustomRoutineId)?.notes.map((note) => note.writtenMidi) ?? []
  }

  return buildBalanceTargetsFromWritten(written, instrument)
}

export function routineSummary(
  settings: BalanceSettings,
  customRoutines: readonly BalanceCustomRoutine[],
): string {
  if (settings.routineType === 'single') {
    return `Single Note · Written ${midiToBalanceNoteName(settings.single.writtenMidi)} · ${settings.single.repetitions} repetitions`
  }
  if (settings.routineType === 'scale') {
    const root = midiToBalanceNoteName(settings.scale.rootWrittenMidi).replace(/\d+$/, '')
    return `${root} ${BALANCE_SCALE_TYPE_LABELS[settings.scale.scaleType]} · ${settings.scale.octaveRange} octave${settings.scale.octaveRange === 1 ? '' : 's'} · ${BALANCE_DIRECTION_LABELS[settings.scale.direction]}`
  }
  const routine = customRoutines.find((item) => item.id === settings.selectedCustomRoutineId)
  return routine ? `${routine.name} · ${routine.notes.length} notes` : 'Choose a saved custom routine'
}

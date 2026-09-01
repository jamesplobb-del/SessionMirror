import type { MetronomeSubdivision } from './metronomeTypes'
import { pulseNoteUnits, ticksPerPulse } from './metronomeTiming'
import type { MetronomeMeter } from './timeSignatureDefinitions'

/**
 * How to DRAW one conducting beat filled with the current subdivision.
 *
 * The subdivision ids are absolute note names ('8ths', '16ths') but the engine
 * means "divide the beat by N" — the two only agree under a quarter-note
 * pulse. Under an eighth pulse "8ths" plays sixteenths; under a dotted quarter
 * it plays the three natural eighths. Drawing the beat as a rhythm cell sizes
 * itself to whatever the beat is, so it stays correct without the reader
 * having to translate.
 */
export interface RhythmCellNotation {
  /** Notes drawn in the cell — one conducting beat's worth. */
  count: number
  /** Notated length of each drawn note, in sixteenth-note units. */
  noteUnits: number
  /** Beams joining the group. 1 = eighths, 2 = sixteenths, 0 = separate stems. */
  beams: number
  /** Each note carries an augmentation dot. */
  dotted: boolean
  /** Hollow notehead — half note or longer. */
  hollow: boolean
  /** Stemless — whole note or longer. */
  stemless: boolean
  /** Tuplet number to print over the group, when the division is not binary. */
  tuplet?: number
}

interface NoteValue {
  beams: number
  dotted: boolean
  hollow: boolean
  stemless: boolean
}

/** Notated note values, keyed by length in sixteenth-note units. */
const NOTE_VALUES: Record<string, NoteValue> = {
  '16': { beams: 0, dotted: false, hollow: true, stemless: true },
  '12': { beams: 0, dotted: true, hollow: true, stemless: false },
  '8': { beams: 0, dotted: false, hollow: true, stemless: false },
  '6': { beams: 0, dotted: true, hollow: false, stemless: false },
  '4': { beams: 0, dotted: false, hollow: false, stemless: false },
  '3': { beams: 1, dotted: true, hollow: false, stemless: false },
  '2': { beams: 1, dotted: false, hollow: false, stemless: false },
  '1': { beams: 2, dotted: false, hollow: false, stemless: false },
  '0.5': { beams: 3, dotted: false, hollow: false, stemless: false },
  '0.25': { beams: 4, dotted: false, hollow: false, stemless: false },
}

function noteValueKey(units: number): string {
  return String(Number(units.toFixed(4)))
}

function lookupNoteValue(units: number): NoteValue | undefined {
  return NOTE_VALUES[noteValueKey(units)]
}

export function getRhythmCellNotation(
  meter: MetronomeMeter,
  subdivision: MetronomeSubdivision,
  pulseCount?: number,
): RhythmCellNotation {
  const beatUnits = pulseNoteUnits(meter, pulseCount)
  const count = ticksPerPulse(meter, subdivision, pulseCount)
  const tickUnits = beatUnits / count

  const plain = lookupNoteValue(tickUnits)
  if (plain) {
    // The division lands on a real note value, so it needs no tuplet number.
    // This is what makes the three eighths of a compound beat draw as plain
    // eighths rather than as a triplet — they are the beat, not a borrowing.
    return { count, noteUnits: tickUnits, tuplet: undefined, ...plain }
  }

  // A tuplet replaces the next-LOWER power of two, so 3 notes are drawn at
  // half the beat's value and 5 or 7 at a quarter of it.
  const replaced = 2 ** Math.floor(Math.log2(count))
  const drawnUnits = beatUnits / replaced
  const drawn = lookupNoteValue(drawnUnits) ?? NOTE_VALUES['2']
  return { count, noteUnits: drawnUnits, tuplet: count, ...drawn }
}

/** The conducting beat drawn on its own — the note BPM refers to. */
export function getPulseNotation(
  meter: MetronomeMeter,
  pulseCount?: number,
): RhythmCellNotation {
  return getRhythmCellNotation(meter, 'off', pulseCount)
}

/** "3 per beat" / "6 per beat" — how the cell reads out loud. */
export function rhythmCellHint(notation: RhythmCellNotation): string {
  if (notation.count <= 1) return 'Beat only'
  return `${notation.count} per beat`
}

/**
 * Hard-coded treble-clef visual positions.
 * staffStep: diatonic step from bottom line (E4 = 0). Each step = half a line spacing.
 * Do not derive positions visually — always look up or extrapolate from this map.
 */

export interface StaffVisualPosition {
  staffStep: number
  /** e.g. "C4", "G4" */
  noteId: string
  /** ledger | space | line */
  kind: 'ledger' | 'space' | 'line'
}

/** Canonical treble staff positions (concert pitch). */
export const TREBLE_NOTE_POSITIONS: Record<string, StaffVisualPosition> = {
  C4: { staffStep: -2, noteId: 'C4', kind: 'ledger' },
  D4: { staffStep: -1, noteId: 'D4', kind: 'space' },
  E4: { staffStep: 0, noteId: 'E4', kind: 'line' },
  F4: { staffStep: 1, noteId: 'F4', kind: 'space' },
  G4: { staffStep: 2, noteId: 'G4', kind: 'line' },
  A4: { staffStep: 3, noteId: 'A4', kind: 'space' },
  B4: { staffStep: 4, noteId: 'B4', kind: 'line' },
  C5: { staffStep: 5, noteId: 'C5', kind: 'space' },
  D5: { staffStep: 6, noteId: 'D5', kind: 'line' },
  E5: { staffStep: 7, noteId: 'E5', kind: 'space' },
  F5: { staffStep: 8, noteId: 'F5', kind: 'line' },
  G5: { staffStep: 9, noteId: 'G5', kind: 'space' },
  A5: { staffStep: 10, noteId: 'A5', kind: 'ledger' },
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Diatonic step offsets from E within an octave (E=0 … D=6). */
const DIATONIC_FROM_E = [4, 5, 6, 0, 1, 2, 3] as const // C,D,E,F,G,A,B mapped to steps from E

const DIATONIC_PC = new Set([0, 2, 4, 5, 7, 9, 11])

export function midiToNoteId(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  const pc = ((midi % 12) + 12) % 12
  return `${NOTE_NAMES[pc]}${octave}`
}

function diatonicStepFromE4(midi: number): number {
  const octave = Math.floor(midi / 12) - 1
  const pc = ((midi % 12) + 12) % 12
  const diatonicIndex = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pc]!
  const octaveSteps = (octave - 4) * 7
  return octaveSteps + DIATONIC_FROM_E[diatonicIndex]!
}

function kindForStep(staffStep: number): StaffVisualPosition['kind'] {
  if (staffStep < 0 || staffStep > 8) return 'ledger'
  return staffStep % 2 === 0 ? 'line' : 'space'
}

/**
 * Returns the hard-coded (or map-extrapolated) staff position for a MIDI note.
 */
export function getStaffPositionForMidi(midi: number): StaffVisualPosition {
  const noteId = midiToNoteId(midi)
  const mapped = TREBLE_NOTE_POSITIONS[noteId]
  if (mapped) return mapped

  const staffStep = diatonicStepFromE4(midi)
  return {
    staffStep,
    noteId,
    kind: kindForStep(staffStep),
  }
}

/** Convert staffStep to a 0–1 vertical ratio within the playfield (0 = bottom). */
export function staffStepToYRatio(staffStep: number, minStep: number, maxStep: number): number {
  const padding = 1.5
  const lo = minStep - padding
  const hi = maxStep + padding
  const range = hi - lo || 1
  return 1 - (staffStep - lo) / range
}

export function isDiatonicMidi(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12
  return DIATONIC_PC.has(pc)
}

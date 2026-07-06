/**
 * Hard-coded treble-clef layout in absolute pixels.
 * Do not derive positions from screen height or guess visually.
 */

export const STAFF_TOP_Y = 360
export const STAFF_LINE_GAP = 28

/** Bottom staff line — E4. */
export const STAFF_BOTTOM_Y = STAFF_TOP_Y + STAFF_LINE_GAP * 4

/** The 5 staff lines: F5, D5, B4, G4, E4. */
export const STAFF_LINE_YPX = {
  F5: STAFF_TOP_Y,
  D5: STAFF_TOP_Y + STAFF_LINE_GAP,
  B4: STAFF_TOP_Y + STAFF_LINE_GAP * 2,
  G4: STAFF_TOP_Y + STAFF_LINE_GAP * 3,
  E4: STAFF_TOP_Y + STAFF_LINE_GAP * 4,
} as const

export const STAFF_LINE_Y_LIST = [
  STAFF_LINE_YPX.F5,
  STAFF_LINE_YPX.D5,
  STAFF_LINE_YPX.B4,
  STAFF_LINE_YPX.G4,
  STAFF_LINE_YPX.E4,
] as const

export interface StaffVisualPosition {
  noteId: string
  yPx: number
  kind: 'ledger' | 'space' | 'line'
}

/**
 * Exact Y center for every named treble note position.
 * Lines: F5, D5, B4, G4, E4
 * Spaces: G5, E5, C5, A4, F4, D4
 * Ledger: C4 (below), A5 (above)
 */
export const TREBLE_NOTE_YPX: Record<string, number> = {
  G5: STAFF_TOP_Y - STAFF_LINE_GAP / 2,
  F5: STAFF_TOP_Y,
  E5: STAFF_TOP_Y + STAFF_LINE_GAP / 2,
  D5: STAFF_TOP_Y + STAFF_LINE_GAP,
  C5: STAFF_TOP_Y + STAFF_LINE_GAP * 1.5,
  B4: STAFF_TOP_Y + STAFF_LINE_GAP * 2,
  A4: STAFF_TOP_Y + STAFF_LINE_GAP * 2.5,
  G4: STAFF_TOP_Y + STAFF_LINE_GAP * 3,
  F4: STAFF_TOP_Y + STAFF_LINE_GAP * 3.5,
  E4: STAFF_TOP_Y + STAFF_LINE_GAP * 4,
  D4: STAFF_TOP_Y + STAFF_LINE_GAP * 4.5,
  C4: STAFF_TOP_Y + STAFF_LINE_GAP * 5,
  A5: STAFF_TOP_Y - STAFF_LINE_GAP,
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const DIATONIC_FROM_E = [4, 5, 6, 0, 1, 2, 3] as const

const LINE_NOTE_IDS = new Set(['E4', 'G4', 'B4', 'D5', 'F5'])

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

function kindForNoteId(noteId: string): StaffVisualPosition['kind'] {
  if (noteId === 'C4' || noteId === 'A5') return 'ledger'
  if (LINE_NOTE_IDS.has(noteId)) return 'line'
  return 'space'
}

/** Y center for a note — map lookup first, then diatonic extrapolation from E4. */
export function getNoteYpxForMidi(midi: number): number {
  const noteId = midiToNoteId(midi)
  const mapped = TREBLE_NOTE_YPX[noteId]
  if (mapped != null) return mapped

  const stepFromE4 = diatonicStepFromE4(midi)
  return STAFF_BOTTOM_Y - stepFromE4 * (STAFF_LINE_GAP / 2)
}

export function getStaffPositionForMidi(midi: number): StaffVisualPosition {
  const noteId = midiToNoteId(midi)
  return {
    noteId,
    yPx: getNoteYpxForMidi(midi),
    kind: kindForNoteId(noteId),
  }
}

/** Notes on or above the middle line (B4) take stems down. */
export function noteStemPointsDown(yPx: number): boolean {
  return yPx <= STAFF_LINE_YPX.B4
}

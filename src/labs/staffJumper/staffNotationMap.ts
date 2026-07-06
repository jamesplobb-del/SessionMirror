/**
 * Hard-coded treble-clef layout in absolute pixels (world coordinates).
 * These are world-space values; the component scales them to screen.
 *
 * FORMULA (per spec):
 *   E4 (bottom line)  = STAFF_BOTTOM_Y
 *   Each step up      = −STAFF_HALF_STEP
 *   Each step down    = +STAFF_HALF_STEP
 *   C4                = E4 + 2 * STAFF_HALF_STEP  (ledger below)
 *   D4                = E4 + 1 * STAFF_HALF_STEP  (space below)
 */

/** Gap between adjacent staff lines (line → next line). */
export const STAFF_LINE_GAP = 46

/** Half a gap — the distance from a line to the next space. */
export const STAFF_HALF_STEP = STAFF_LINE_GAP / 2

/**
 * Y of the TOP staff line (F5) in world pixels.
 * Small value so the canvas does not waste space above the staff.
 * A5 sits STAFF_LINE_GAP above F5, so we need at least that much room.
 */
export const STAFF_TOP_Y = 72

/** Y of the bottom staff line (E4). */
export const STAFF_BOTTOM_Y = STAFF_TOP_Y + STAFF_LINE_GAP * 4

/** The 5 staff line Y positions (world px). */
export const STAFF_LINE_YPX = {
  F5: STAFF_TOP_Y,
  D5: STAFF_TOP_Y + STAFF_LINE_GAP * 1,
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
 * Hard-coded notehead Y centers (world px).
 * Lines: F5, D5, B4, G4, E4
 * Spaces: G5, E5, C5, A4, F4, D4
 * Ledger: A5 (above), C4 (below)
 */
export const TREBLE_NOTE_YPX: Record<string, number> = {
  A5: STAFF_TOP_Y - STAFF_LINE_GAP,             // ledger above
  G5: STAFF_TOP_Y - STAFF_HALF_STEP,            // space above top line
  F5: STAFF_TOP_Y,                               // top line
  E5: STAFF_TOP_Y + STAFF_HALF_STEP,            // 4th space
  D5: STAFF_TOP_Y + STAFF_LINE_GAP * 1,         // 4th line
  C5: STAFF_TOP_Y + STAFF_LINE_GAP * 1.5,       // 3rd space
  B4: STAFF_TOP_Y + STAFF_LINE_GAP * 2,         // middle line
  A4: STAFF_TOP_Y + STAFF_LINE_GAP * 2.5,       // 2nd space
  G4: STAFF_TOP_Y + STAFF_LINE_GAP * 3,         // 2nd line
  F4: STAFF_TOP_Y + STAFF_LINE_GAP * 3.5,       // 1st space
  E4: STAFF_TOP_Y + STAFF_LINE_GAP * 4,         // bottom line
  D4: STAFF_TOP_Y + STAFF_LINE_GAP * 4.5,       // space below staff
  C4: STAFF_TOP_Y + STAFF_LINE_GAP * 5,         // ledger below staff
}

/** Notehead dimensions in world pixels. */
export const NOTEHEAD_W = 50
export const NOTEHEAD_H = 40

/** Ledger line extends beyond each side of the notehead. */
export const LEDGER_LINE_W = NOTEHEAD_W + 14

/** Total canvas height — enough room for A5 above and C4 below with padding. */
export const STAFF_CANVAS_HEIGHT = STAFF_TOP_Y + STAFF_LINE_GAP * 7

/** First notehead X in the scrolling world. */
export const STAFF_FIRST_NOTE_X = 168

/** Clef left edge in the scrolling world. */
export const STAFF_CLEF_X = 8

/**
 * Treble clef glyph size in world px.
 * Spans roughly one staff height plus ledger curl — matches engraved proportions.
 */
export const TREBLE_CLEF_FONT_SIZE = STAFF_LINE_GAP * 5.75

/** Horizontal spacing between noteheads (world px). */
export const NOTE_SPACING_PX = 100

/** Player is anchored here in screen pixels. */
export const PLAYER_ANCHOR_X_PX = 120

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
  return (octave - 4) * 7 + DIATONIC_FROM_E[diatonicIndex]!
}

function kindForNoteId(noteId: string): StaffVisualPosition['kind'] {
  if (noteId === 'C4' || noteId === 'A5') return 'ledger'
  if (LINE_NOTE_IDS.has(noteId)) return 'line'
  return 'space'
}

export function getNoteYpxForMidi(midi: number): number {
  const noteId = midiToNoteId(midi)
  const mapped = TREBLE_NOTE_YPX[noteId]
  if (mapped != null) return mapped
  // Extrapolate: each diatonic step = STAFF_HALF_STEP from E4
  return STAFF_BOTTOM_Y - diatonicStepFromE4(midi) * STAFF_HALF_STEP
}

export function getStaffPositionForMidi(midi: number): StaffVisualPosition {
  const noteId = midiToNoteId(midi)
  const yPx = getNoteYpxForMidi(midi)
  return {
    noteId,
    yPx,
    kind: kindForNoteId(noteId),
  }
}

/** Half the notehead height — used to find top surface (where player stands). */
export function noteheadHalfHeight(): number {
  return NOTEHEAD_H / 2
}

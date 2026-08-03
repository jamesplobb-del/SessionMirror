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
 * Y of the top staff line (F5) in world pixels.
 *
 * Staff Jumper can generate C4 through B6. B6 needs four ledger lines above
 * the staff, so the top line deliberately sits far enough down the canvas to
 * keep that entire written range in bounds.
 */
export const STAFF_TOP_Y = 250

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

/** Visual midpoint of the five-line staff. */
export const STAFF_MIDDLE_Y = (STAFF_TOP_Y + STAFF_BOTTOM_Y) / 2

export interface StaffVisualPosition {
  noteId: string
  yPx: number
  kind: 'ledger' | 'space' | 'line'
  /** Every ledger rule needed to read this note, ordered from the staff outward. */
  ledgerLineYPx: number[]
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

/**
 * Vertical world span includes all generated targets and their ledger rules.
 * The highest possible target is B6 at y=20; the lowest is C4 at y=480.
 */
export const STAFF_CANVAS_HEIGHT = STAFF_BOTTOM_Y + STAFF_LINE_GAP * 2

/** First notehead X in the scrolling world. */
export const STAFF_FIRST_NOTE_X = 168

/** Clef left edge in the scrolling world. */
export const STAFF_CLEF_X = 8

/**
 * Treble clef glyph size in world px.
 * Spans roughly one staff height plus ledger curl — matches engraved proportions.
 */
export const TREBLE_CLEF_FONT_SIZE = STAFF_LINE_GAP * 4.9

/** Horizontal spacing between noteheads (world px). */
export const NOTE_SPACING_PX = 100

/** Player anchor leaves the clef visible and the next target clear on phones. */
export const PLAYER_ANCHOR_X_PX = 150

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export const STAFF_NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
export type StaffNoteLetter = (typeof STAFF_NOTE_LETTERS)[number]

const E4_DIATONIC_INDEX = 4 * 7 + STAFF_NOTE_LETTERS.indexOf('E')

function diatonicIndex(letter: StaffNoteLetter, octave: number): number {
  return octave * 7 + STAFF_NOTE_LETTERS.indexOf(letter)
}

function relativeStepFromE4(letter: StaffNoteLetter, octave: number): number {
  return diatonicIndex(letter, octave) - E4_DIATONIC_INDEX
}

function yForRelativeStep(relativeStep: number): number {
  return STAFF_BOTTOM_Y - relativeStep * STAFF_HALF_STEP
}

function ledgerLinesForRelativeStep(relativeStep: number): number[] {
  const ledgerLines: number[] = []

  if (relativeStep < 0) {
    for (let step = -2; step >= relativeStep; step -= 2) {
      ledgerLines.push(yForRelativeStep(step))
    }
  } else if (relativeStep > 8) {
    for (let step = 10; step <= relativeStep; step += 2) {
      ledgerLines.push(yForRelativeStep(step))
    }
  }

  return ledgerLines
}

export function midiToNoteId(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  const pc = ((midi % 12) + 12) % 12
  return `${NOTE_NAMES[pc]}${octave}`
}

export function getNoteYpxForMidi(midi: number): number {
  const octave = Math.floor(midi / 12) - 1
  const pitchClass = ((midi % 12) + 12) % 12
  const letter = NOTE_NAMES[pitchClass]![0] as StaffNoteLetter
  return getStaffPositionForNote(letter, octave).yPx
}

export function getStaffPositionForMidi(midi: number): StaffVisualPosition {
  const octave = Math.floor(midi / 12) - 1
  const pitchClass = ((midi % 12) + 12) % 12
  const letter = NOTE_NAMES[pitchClass]![0] as StaffNoteLetter
  const position = getStaffPositionForNote(letter, octave)
  return {
    ...position,
    noteId: midiToNoteId(midi),
  }
}

/**
 * Resolve notation from the written letter and octave, not the sounding MIDI
 * pitch. This is essential for enharmonics: C♭5 belongs on the C5 space even
 * though it sounds as MIDI B4, while F♯4 remains on the F4 space.
 */
export function getStaffPositionForNote(
  letter: StaffNoteLetter,
  octave: number,
): StaffVisualPosition {
  const relativeStep = relativeStepFromE4(letter, octave)
  const isLine = relativeStep % 2 === 0
  const isOutsideStaff = relativeStep < 0 || relativeStep > 8

  return {
    noteId: `${letter}${octave}`,
    yPx: yForRelativeStep(relativeStep),
    kind: isLine ? (isOutsideStaff ? 'ledger' : 'line') : 'space',
    ledgerLineYPx: ledgerLinesForRelativeStep(relativeStep),
  }
}

/** Half the notehead height — used to find top surface (where player stands). */
export function noteheadHalfHeight(): number {
  return NOTEHEAD_H / 2
}

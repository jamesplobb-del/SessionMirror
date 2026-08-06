/**
 * Clef-aware staff layout in absolute pixels (world coordinates).
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

export const STAFF_JUMPER_CLEFS = ['treble', 'bass'] as const
export type StaffJumperClef = (typeof STAFF_JUMPER_CLEFS)[number]

export const CLEF_LABELS: Record<StaffJumperClef, string> = {
  treble: 'Treble',
  bass: 'Bass',
}

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

/**
 * One staff space — the white gap between two lines. Every engraved dimension
 * in this game is expressed as a multiple of it, which is how real notation
 * stays in proportion at any size.
 */
export const STAFF_SPACE_PX = STAFF_LINE_GAP

/**
 * Notehead dimensions in world pixels.
 * An engraved notehead fills one staff space vertically and is a little wider
 * than it is tall.
 */
export const NOTEHEAD_H = Math.round(STAFF_SPACE_PX * 0.96)
export const NOTEHEAD_W = Math.round(NOTEHEAD_H * 1.28)

/** Ledger line extends about a third of a space past each side of the head. */
export const LEDGER_LINE_W = Math.round(NOTEHEAD_W + STAFF_SPACE_PX * 0.66)

/** Rule thickness. Ledger lines are drawn a touch heavier than staff lines. */
export const STAFF_LINE_THICKNESS = 3.4
export const LEDGER_LINE_THICKNESS = 4.2

/* ── Rhythm notation, all in engraved staff-space proportions ────────────── */

/** Stem reaches an octave — 3.5 spaces — from the notehead centre. */
export const STEM_LENGTH = STAFF_SPACE_PX * 3.5
export const STEM_THICKNESS = Math.max(2.6, STAFF_SPACE_PX * 0.12)

/** Beams are half a space thick, spaced three quarters of a space apart. */
export const BEAM_THICKNESS = STAFF_SPACE_PX * 0.5
export const BEAM_SPACING = STAFF_SPACE_PX * 0.75

/** A beam never slants more than this, however far the pitches jump. */
export const BEAM_MAX_SLANT = STAFF_SPACE_PX * 1.5

/** Hollow (half and whole) noteheads are drawn as rings of this weight. */
export const NOTEHEAD_RING_THICKNESS = Math.max(3, STAFF_SPACE_PX * 0.17)

/** Augmentation dot. */
export const DOT_RADIUS = STAFF_SPACE_PX * 0.17
export const DOT_GAP = STAFF_SPACE_PX * 0.42

export const BARLINE_THICKNESS = Math.max(2.6, STAFF_SPACE_PX * 0.11)

/** Time signature numerals, sized to span two staff spaces each. */
export const TIME_SIGNATURE_FONT_SIZE = STAFF_SPACE_PX * 2.05

/**
 * Where each numeral sits: the upper number is centred on the second space
 * from the top, the lower on the second space from the bottom.
 */
export const TIME_SIGNATURE_YPX: Record<StaffJumperClef, { top: number; bottom: number }> = {
  treble: { top: STAFF_TOP_Y + STAFF_LINE_GAP, bottom: STAFF_TOP_Y + STAFF_LINE_GAP * 3 },
  bass: { top: STAFF_TOP_Y + STAFF_LINE_GAP, bottom: STAFF_TOP_Y + STAFF_LINE_GAP * 3 },
}

export type StemDirection = 'up' | 'down'

/**
 * Stems point away from the middle line, so notes high on the staff hang their
 * stem down and low notes push it up — the rule that keeps a line of music
 * inside its own staff.
 */
export function stemDirectionForY(yPx: number): StemDirection {
  return yPx > STAFF_MIDDLE_Y ? 'up' : 'down'
}

/** X of the stem's centre line, on whichever side of the head it belongs. */
export function stemXForNote(noteXPx: number, direction: StemDirection): number {
  const offset = NOTEHEAD_W / 2 - STEM_THICKNESS / 2
  return direction === 'up' ? noteXPx + offset : noteXPx - offset
}

/** Y of the stem tip when the note is not part of a beam group. */
export function stemTipY(noteYPx: number, direction: StemDirection): number {
  return direction === 'up' ? noteYPx - STEM_LENGTH : noteYPx + STEM_LENGTH
}

/**
 * Y of an augmentation dot.
 *
 * A dot always sits in a space, so a note sitting on a line pushes its dot up
 * into the space above rather than colliding with the rule.
 */
export function dotYForNote(noteYPx: number, kind: 'ledger' | 'space' | 'line'): number {
  return kind === 'space' ? noteYPx : noteYPx - STAFF_HALF_STEP
}

/**
 * Vertical world span includes all generated targets and their ledger rules.
 * The highest possible target is B6 at y=20; the lowest is C4 at y=480.
 */
export const STAFF_CANVAS_HEIGHT = STAFF_BOTTOM_Y + STAFF_LINE_GAP * 3

/** First notehead X in the scrolling world. */
export const STAFF_FIRST_NOTE_X = 250

/** Width reserved for the time signature in the pinned staff head. */
export const TIME_SIGNATURE_WIDTH = Math.round(STAFF_SPACE_PX * 1.12)

/** Clef left edge in the pinned head of the staff. */
export const STAFF_CLEF_X = 10

/** Gap between the clef and the first key-signature accidental. */
export const CLEF_TO_SIGNATURE_GAP = Math.round(STAFF_SPACE_PX * 0.34)

/** Gap between the pinned staff head and the first scrolling notehead. */
export const SIGNATURE_TO_NOTE_GAP = Math.round(STAFF_SPACE_PX * 0.62)

/**
 * Staff position each clef names, used to anchor its glyph.
 * The G clef spirals around the second line from the bottom; the F clef's dot
 * sits on the fourth line.
 */
export const CLEF_ANCHOR_YPX: Record<StaffJumperClef, number> = {
  treble: STAFF_TOP_Y + STAFF_LINE_GAP * 3,
  bass: STAFF_TOP_Y + STAFF_LINE_GAP * 1,
}

/** Horizontal spacing between noteheads (world px). */
export const NOTE_SPACING_PX = 96

/**
 * Minimum screen X for the player. The real anchor also clears the pinned
 * clef and key signature, which get wider with six sharps or flats.
 *
 * Every pixel here is a pixel of lookahead lost, so it sits just far enough in
 * to keep the landed note visible behind the player.
 */
export const PLAYER_ANCHOR_X_PX = 124

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export const STAFF_NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
export type StaffNoteLetter = (typeof STAFF_NOTE_LETTERS)[number]

const BOTTOM_LINE_NOTE: Record<StaffJumperClef, { letter: StaffNoteLetter; octave: number }> = {
  treble: { letter: 'E', octave: 4 },
  bass: { letter: 'G', octave: 2 },
}

function diatonicIndex(letter: StaffNoteLetter, octave: number): number {
  return octave * 7 + STAFF_NOTE_LETTERS.indexOf(letter)
}

function relativeStepFromBottomLine(
  letter: StaffNoteLetter,
  octave: number,
  clef: StaffJumperClef,
): number {
  const bottomLine = BOTTOM_LINE_NOTE[clef]
  return diatonicIndex(letter, octave) - diatonicIndex(bottomLine.letter, bottomLine.octave)
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

export function getNoteYpxForMidi(midi: number, clef: StaffJumperClef = 'treble'): number {
  const octave = Math.floor(midi / 12) - 1
  const pitchClass = ((midi % 12) + 12) % 12
  const letter = NOTE_NAMES[pitchClass]![0] as StaffNoteLetter
  return getStaffPositionForNote(letter, octave, clef).yPx
}

export function getStaffPositionForMidi(
  midi: number,
  clef: StaffJumperClef = 'treble',
): StaffVisualPosition {
  const octave = Math.floor(midi / 12) - 1
  const pitchClass = ((midi % 12) + 12) % 12
  const letter = NOTE_NAMES[pitchClass]![0] as StaffNoteLetter
  const position = getStaffPositionForNote(letter, octave, clef)
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
  clef: StaffJumperClef = 'treble',
): StaffVisualPosition {
  const relativeStep = relativeStepFromBottomLine(letter, octave, clef)
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

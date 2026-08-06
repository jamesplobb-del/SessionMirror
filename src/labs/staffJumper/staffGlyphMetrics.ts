/**
 * Music glyphs are sized from the staff, not from a hardcoded font size.
 *
 * The accidental and clef characters come from whatever music font the device
 * has (Apple Symbols on iOS, Noto Music elsewhere), and those fonts disagree
 * wildly about how much of the em box the glyph actually fills. Measuring the
 * ink box once at runtime lets us say "this flat should be 2.5 staff spaces
 * tall with its bowl on the note" and have it come out right everywhere.
 */

export type MusicGlyphName = 'sharp' | 'flat' | 'natural' | 'trebleClef' | 'bassClef'

export const MUSIC_GLYPH_FONT_FAMILY =
  "'Bravura', 'Apple Symbols', 'Noto Music', 'Noto Sans Symbols 2', 'Segoe UI Symbol', serif"

export const MUSIC_GLYPH_CHARS: Record<MusicGlyphName, string> = {
  sharp: '♯',
  flat: '♭',
  natural: '♮',
  trebleClef: '\u{1D11E}',
  bassClef: '\u{1D122}',
}

/**
 * Ink box in staff spaces, taken from the SMuFL/Bravura reference bounding
 * boxes. Normalizing to these makes the notation hold engraved proportions no
 * matter which music font the device actually supplies — text fonts draw a much
 * wider, shorter ♯ and ♭ than an engraving font does, and at six accidentals
 * that difference is the whole width of a phone.
 */
export const GLYPH_HEIGHT_IN_SPACES: Record<MusicGlyphName, number> = {
  sharp: 2.8,
  flat: 2.65,
  natural: 2.8,
  // Under engraved size on purpose. A full 7-space G clef plus a signature ate
  // close to half the visible staff on a phone; the notes need that room more
  // than the clef does.
  trebleClef: 5.9,
  bassClef: 3.1,
}

export const GLYPH_WIDTH_IN_SPACES: Record<MusicGlyphName, number> = {
  sharp: 1.0,
  flat: 0.9,
  natural: 0.66,
  trebleClef: 2.26,
  bassClef: 2.36,
}

/**
 * Where the glyph's staff position sits, as a fraction down its ink box.
 *
 * A sharp and a natural straddle their line, so they anchor at the middle. A
 * flat hangs a tall stem above a small bowl and it is the bowl that sits on the
 * note. A G clef wraps its spiral around the G line, a little below its middle;
 * an F clef puts its dot near the top, on the F line.
 */
export const GLYPH_STAFF_ANCHOR: Record<MusicGlyphName, number> = {
  sharp: 0.5,
  natural: 0.5,
  flat: 0.736,
  trebleClef: 0.625,
  bassClef: 0.27,
}

/** Ink box measured per 1px of font size. */
export interface GlyphInkMetrics {
  ascent: number
  descent: number
  height: number
  left: number
  right: number
  width: number
}

/**
 * Fallbacks used before measurement lands (and on any platform that refuses to
 * report ink boxes). Roughly the Apple Symbols proportions.
 */
const FALLBACK_METRICS: Record<MusicGlyphName, GlyphInkMetrics> = {
  sharp: { ascent: 0.62, descent: 0.1, height: 0.72, left: -0.08, right: 0.38, width: 0.46 },
  flat: { ascent: 0.64, descent: 0.06, height: 0.7, left: -0.07, right: 0.3, width: 0.37 },
  natural: { ascent: 0.62, descent: 0.1, height: 0.72, left: -0.1, right: 0.28, width: 0.38 },
  trebleClef: { ascent: 0.66, descent: 0.08, height: 0.73, left: -0.03, right: 0.31, width: 0.34 },
  bassClef: { ascent: 0.66, descent: 0, height: 0.65, left: -0.03, right: 0.56, width: 0.59 },
}

const REFERENCE_FONT_SIZE = 200

let cachedMetrics: Record<MusicGlyphName, GlyphInkMetrics> | null = null

/**
 * Measure every glyph's ink box, normalized to a 1px font size.
 * Cached — the answer only changes if the available fonts change.
 */
export function measureMusicGlyphs(): Record<MusicGlyphName, GlyphInkMetrics> {
  if (cachedMetrics) return cachedMetrics
  if (typeof document === 'undefined') return FALLBACK_METRICS

  const context = document.createElement('canvas').getContext('2d')
  if (!context) return FALLBACK_METRICS

  context.font = `${REFERENCE_FONT_SIZE}px ${MUSIC_GLYPH_FONT_FAMILY}`
  const measured = {} as Record<MusicGlyphName, GlyphInkMetrics>

  for (const name of Object.keys(MUSIC_GLYPH_CHARS) as MusicGlyphName[]) {
    const metrics = context.measureText(MUSIC_GLYPH_CHARS[name])
    const ascent = metrics.actualBoundingBoxAscent / REFERENCE_FONT_SIZE
    const descent = metrics.actualBoundingBoxDescent / REFERENCE_FONT_SIZE
    // actualBoundingBoxLeft grows leftward, so negate it back into x-space.
    const left = -metrics.actualBoundingBoxLeft / REFERENCE_FONT_SIZE
    const right = metrics.actualBoundingBoxRight / REFERENCE_FONT_SIZE
    const height = ascent + descent
    const width = right - left

    measured[name] =
      height > 0.05 && width > 0.02
        ? { ascent, descent, height, left, right, width }
        : FALLBACK_METRICS[name]
  }

  cachedMetrics = measured
  return measured
}

export interface GlyphLayout {
  fontSize: number
  /** Drawn size in world px. */
  width: number
  height: number
  /** Natural ink width at `fontSize`, before any width normalization. */
  naturalWidth: number
  /** Offset from the ink-box top down to the glyph's staff position. */
  anchorOffsetY: number
  /** Where to draw the glyph inside its ink box. */
  drawX: number
  baselineY: number
}

/**
 * Turn a staff space size into everything needed to draw one glyph in an SVG
 * box that is exactly its ink box.
 */
export function layoutMusicGlyph(
  name: MusicGlyphName,
  spacePx: number,
  metrics: Record<MusicGlyphName, GlyphInkMetrics> = measureMusicGlyphs(),
): GlyphLayout {
  const ink = metrics[name]
  const height = GLYPH_HEIGHT_IN_SPACES[name] * spacePx
  const fontSize = height / ink.height
  const naturalWidth = ink.width * fontSize
  return {
    fontSize,
    width: GLYPH_WIDTH_IN_SPACES[name] * spacePx,
    height,
    naturalWidth,
    anchorOffsetY: GLYPH_STAFF_ANCHOR[name] * height,
    drawX: -ink.left * fontSize,
    baselineY: ink.ascent * fontSize,
  }
}

/** Center-to-center spacing between key-signature accidentals, in world px. */
export function keySignatureStepPx(symbol: '#' | 'b', spacePx: number): number {
  return (symbol === '#' ? 0.8 : 0.7) * spacePx
}

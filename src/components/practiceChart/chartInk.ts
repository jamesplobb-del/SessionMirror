/**
 * Rehearsal marks on the part.
 *
 * This is a marker, not a pencil: two colours, three nibs, and an undo. A
 * rehearsal mark is a circled accidental, a breath, a bar number — the things
 * you scribble in a sectional and want to still be there next week. Anything
 * more (stamps, layers, shapes, a library of pens) is forScore's job.
 *
 * Points are stored per page in **page-normalised coordinates**, 0..1 of that
 * page's own box, so a mark stays where it was drawn through a rotation, a
 * spread, a fit change and any screen it is ever opened on.
 */

export type InkColour = 'black' | 'red'
export type InkWidth = 'fine' | 'medium' | 'bold'

export const INK_WIDTHS: readonly InkWidth[] = ['fine', 'medium', 'bold']
/** New marks start thinner than the original single nib, which read as a highlighter. */
export const DEFAULT_INK_WIDTH: InkWidth = 'fine'

export const INK_WIDTH_PX: Record<InkWidth, number> = {
  fine: 1.7,
  medium: 2.5,
  bold: 3.8,
}

/** Stroke width as a fraction of the page's shorter side, for the saved PDF. */
export const INK_WIDTH_RATIO: Record<InkWidth, number> = {
  fine: 0.0018,
  medium: 0.0028,
  bold: 0.0042,
}

export function inkStrokeWidthPx(width?: InkWidth): number {
  return INK_WIDTH_PX[width && INK_WIDTHS.includes(width) ? width : 'bold']
}

export function inkStrokeWidthRatio(width?: InkWidth): number {
  return INK_WIDTH_RATIO[width && INK_WIDTHS.includes(width) ? width : 'bold']
}

export interface InkStroke {
  /** Zero-based page index this mark belongs to. */
  page: number
  colour: InkColour
  /** Flat [x0, y0, x1, y1, ...] in 0..1 of the page box. */
  points: number[]
  /** Missing on marks from before nibs: drawn at the original bold weight. */
  width?: InkWidth
}

/** Enough for a heavily marked part, small enough that one cannot fill storage. */
const MAX_STROKES = 600
const MAX_POINTS_PER_STROKE = 400

const inkKey = (projectId: string) => `besttake:practice-chart-ink:v1:${projectId}`
const widthKey = 'besttake:practice-chart-ink-width:v1'

export function loadInkWidth(): InkWidth {
  try {
    const raw = localStorage.getItem(widthKey)
    return raw === 'fine' || raw === 'medium' || raw === 'bold' ? raw : DEFAULT_INK_WIDTH
  } catch {
    return DEFAULT_INK_WIDTH
  }
}

export function saveInkWidth(width: InkWidth): void {
  try { localStorage.setItem(widthKey, width) } catch { /* private mode */ }
}

function isFinitePair(a: unknown, b: unknown): boolean {
  return typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)
}

export function parseInkStrokes(value: unknown): InkStroke[] {
  if (!Array.isArray(value)) return []
  const strokes: InkStroke[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as { page?: unknown; colour?: unknown; points?: unknown; width?: unknown }
    const page = Number(entry.page)
    if (!Number.isInteger(page) || page < 0) continue
    if (entry.colour !== 'black' && entry.colour !== 'red') continue
    const width = entry.width === 'fine' || entry.width === 'medium' || entry.width === 'bold'
      ? entry.width
      : undefined
    if (!Array.isArray(entry.points) || entry.points.length < 4 || entry.points.length % 2 !== 0) continue
    const points: number[] = []
    for (let index = 0; index + 1 < entry.points.length; index += 2) {
      const x = entry.points[index]
      const y = entry.points[index + 1]
      if (!isFinitePair(x, y)) continue
      points.push(Math.min(1, Math.max(0, x as number)), Math.min(1, Math.max(0, y as number)))
      if (points.length >= MAX_POINTS_PER_STROKE * 2) break
    }
    if (points.length < 4) continue
    strokes.push(width
      ? { page, colour: entry.colour, points, width }
      : { page, colour: entry.colour, points })
    if (strokes.length >= MAX_STROKES) break
  }
  return strokes
}

export function loadInkStrokes(projectId: string): InkStroke[] {
  try {
    const raw = localStorage.getItem(inkKey(projectId))
    return raw ? parseInkStrokes(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function saveInkStrokes(projectId: string, strokes: InkStroke[]): void {
  try {
    if (strokes.length === 0) localStorage.removeItem(inkKey(projectId))
    // Rounded to four places: a mark is a gesture, not a measurement, and four
    // places is finer than any screen can show.
    else localStorage.setItem(inkKey(projectId), JSON.stringify(
      strokes.slice(-MAX_STROKES).map(stroke => ({
        page: stroke.page,
        colour: stroke.colour,
        ...(stroke.width ? { width: stroke.width } : {}),
        points: stroke.points.map(value => Math.round(value * 1e4) / 1e4),
      })),
    ))
  } catch {
    /* private mode / quota — the marks stay on screen for this sitting */
  }
}

export function clearInkStrokes(projectId: string): void {
  try { localStorage.removeItem(inkKey(projectId)) } catch { /* private mode */ }
}

/**
 * Drop points that do not change the line. A finger produces a point per
 * frame; keeping them all makes a stroke that is expensive to store, to draw
 * and to write into a PDF, and looks no different.
 */
export function simplifyStroke(points: number[], tolerance = 0.0025): number[] {
  if (points.length <= 4) return points
  const kept = [points[0], points[1]]
  let lastX = points[0]
  let lastY = points[1]
  for (let index = 2; index + 1 < points.length - 2; index += 2) {
    const x = points[index]
    const y = points[index + 1]
    if (Math.hypot(x - lastX, y - lastY) < tolerance) continue
    kept.push(x, y)
    lastX = x
    lastY = y
  }
  kept.push(points[points.length - 2], points[points.length - 1])
  return kept
}

/** An SVG path for one stroke, in a 0..1000 viewBox. */
export function inkPathData(points: number[]): string {
  let path = ''
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = (points[index] * 1000).toFixed(2)
    const y = (points[index + 1] * 1000).toFixed(2)
    path += `${index === 0 ? 'M' : 'L'}${x} ${y}`
  }
  return path
}

export const INK_RGB: Record<InkColour, [number, number, number]> = {
  black: [0.1, 0.1, 0.12],
  red: [0.84, 0.13, 0.13],
}

export const INK_CSS: Record<InkColour, string> = {
  black: '#1a1a1f',
  red: '#d62121',
}

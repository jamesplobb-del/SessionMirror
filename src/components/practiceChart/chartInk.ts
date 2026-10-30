/**
 * Rehearsal marks on the part.
 *
 * Two colours, three nibs, and reversible edits. A
 * rehearsal mark is a circled accidental, a breath, a bar number — the things
 * you scribble in a sectional and want to still be there next week. Anything
 * more elaborate belongs outside this small rehearsal tool.
 *
 * Points are stored per page in **page-normalised coordinates**, 0..1 of that
 * page's own box, so a mark stays where it was drawn through a rotation, a
 * spread, a fit change and any screen it is ever opened on.
 */

export type InkColour = 'black' | 'red'
export type InkWidth = 'fine' | 'medium' | 'bold'

/**
 * What is in the player's hand. The eraser is a third thing you pick up rather
 * than a mode on the marker, because it behaves the same way: while it is out,
 * a tap is not a page turn.
 */
export type InkTool = InkColour | 'eraser'

export function isInkColour(tool: InkTool | null): tool is InkColour {
  return tool === 'black' || tool === 'red'
}

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

/** Keep the number of saved gestures bounded without cutting a gesture short. */
const MAX_STROKES = 600

const inkKey = (projectId: string) => `besttake:practice-chart-ink:v1:${projectId}`
const widthKey = 'besttake:practice-chart-ink-width:v1'
const colourKey = 'besttake:practice-chart-ink-colour:v1'

export function loadInkColour(): InkColour {
  try { return localStorage.getItem(colourKey) === 'red' ? 'red' : 'black' }
  catch { return 'black' }
}

export function saveInkColour(colour: InkColour): void {
  try { localStorage.setItem(colourKey, colour) } catch { /* private mode */ }
}

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
    // The writer and live reader keep the complete gesture. Read every valid
    // pair too, including long marks saved by earlier versions.
    const points: number[] = []
    for (let index = 0; index + 1 < entry.points.length; index += 2) {
      const x = entry.points[index]
      const y = entry.points[index + 1]
      if (!isFinitePair(x, y)) continue
      points.push(Math.min(1, Math.max(0, x as number)), Math.min(1, Math.max(0, y as number)))
    }
    if (points.length < 4) continue
    strokes.push(width
      ? { page, colour: entry.colour, points, width }
      : { page, colour: entry.colour, points })
    if (strokes.length >= MAX_STROKES) break
  }
  return strokes
}

/** Score metadata is the committed owner; an unreadable identity fails closed. */
function currentAttachmentId(projectId: string): string | null {
  const raw = localStorage.getItem(`besttake:practice-chart:v1:${projectId}`)
  if (!raw) return null
  const value = JSON.parse(raw) as { attachmentId?: unknown } | null
  if (!value || typeof value !== 'object') throw new Error('Score identity is unavailable.')
  if (value.attachmentId === undefined) return null
  if (typeof value.attachmentId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.attachmentId)) {
    throw new Error('Score identity is unavailable.')
  }
  return value.attachmentId
}

export function loadInkStrokes(projectId: string): InkStroke[] {
  try {
    const raw = localStorage.getItem(inkKey(projectId))
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    const attachmentId = currentAttachmentId(projectId)
    // Existing marks belong to the legacy attachment until it is replaced.
    if (Array.isArray(value)) return attachmentId === null ? parseInkStrokes(value) : []
    if (!value || typeof value !== 'object') return []
    const saved = value as { version?: unknown; attachmentId?: unknown; strokes?: unknown }
    return saved.version === 2 && saved.attachmentId === attachmentId
      ? parseInkStrokes(saved.strokes)
      : []
  } catch {
    return []
  }
}

export function saveInkStrokes(projectId: string, strokes: InkStroke[], expectedAttachmentId?: string | null): boolean {
  try {
    const attachmentId = currentAttachmentId(projectId)
    // A reader callback created for the old part cannot rebind its strokes
    // (or an empty Undo) to a replacement committed while it was still open.
    if (expectedAttachmentId !== undefined && expectedAttachmentId !== attachmentId) return false
    if (strokes.length === 0) localStorage.removeItem(inkKey(projectId))
    // Bind marks to committed score bytes, so a failed old-mark cleanup cannot
    // put the previous part's fingerings or accidentals on its replacement.
    // Four decimal places retain finer precision than any screen can show.
    else localStorage.setItem(inkKey(projectId), JSON.stringify({
      version: 2,
      attachmentId,
      strokes: strokes.slice(-MAX_STROKES).map(stroke => ({
        page: stroke.page,
        colour: stroke.colour,
        ...(stroke.width ? { width: stroke.width } : {}),
        points: stroke.points.map(value => Math.round(value * 1e4) / 1e4),
      })),
    }))
    return true
  } catch { return false }
}

export function clearInkStrokes(projectId: string): boolean {
  try { localStorage.removeItem(inkKey(projectId)); return true } catch { return false }
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

/**
 * The eraser rubs whole marks out, not pieces of them.
 *
 * A mark here is one gesture — a circled accidental, a breath — so taking the
 * whole gesture is what a player means by rubbing it out. Splitting a stroke
 * where the eraser crossed it would leave two orphaned fragments of a circle
 * behind, which is worse than what they were trying to remove.
 *
 * The radius is given per axis in page-normalised units, because a page is not
 * square: dividing by each one turns the ellipse those two numbers describe on
 * the page back into a circle the size of the fingertip on screen.
 */
export function strokeHitsEraser(
  stroke: InkStroke,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
): boolean {
  const rx = Math.max(1e-6, radiusX)
  const ry = Math.max(1e-6, radiusY)
  const points = stroke.points
  if (points.length < 2) return false
  const toX = (value: number) => (value - x) / rx
  const toY = (value: number) => (value - y) / ry

  // A dot has no segment to measure against, so test the point itself.
  if (points.length < 4) {
    const px = toX(points[0])
    const py = toY(points[1])
    return px * px + py * py <= 1
  }

  for (let index = 0; index + 3 < points.length; index += 2) {
    const ax = toX(points[index])
    const ay = toY(points[index + 1])
    const bx = toX(points[index + 2])
    const by = toY(points[index + 3])
    const dx = bx - ax
    const dy = by - ay
    const lengthSquared = dx * dx + dy * dy
    // Closest point on the segment to the origin, which is the eraser centre.
    const t = lengthSquared > 0
      ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared))
      : 0
    const cx = ax + dx * t
    const cy = ay + dy * t
    if (cx * cx + cy * cy <= 1) return true
  }
  return false
}

/**
 * Every mark the eraser is touching, gone. Returns `null` when it touched
 * nothing, so a drag across blank paper does not churn state or storage on
 * every pointer move.
 */
export function eraseStrokesAt(
  strokes: readonly InkStroke[],
  page: number,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
): InkStroke[] | null {
  const kept = strokes.filter(stroke =>
    stroke.page !== page || !strokeHitsEraser(stroke, x, y, radiusX, radiusY))
  return kept.length === strokes.length ? null : kept
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

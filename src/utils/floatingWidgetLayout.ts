const EDGE_INSET = 12
const POSITION_STORAGE_PREFIX = 'sessionmirror:widget-pos:'
const PERSISTENT_POSITION_STORAGE_PREFIX = 'sessionmirror:persistent-widget-pos:'
const SIZE_STORAGE_PREFIX = 'sessionmirror:widget-size:'
export const WIDGET_CONTROL_LAYOUT_EVENT = 'besttake:widget-controls-layout'

export interface WidgetPosition {
  x: number
  y: number
}

export interface WidgetRect extends WidgetPosition {
  width: number
  height: number
}

/** Place a full widget near its ball without covering another panel or an open tray. */
export function findAvailableWidgetPanelPosition(
  boundsWidth: number, boundsHeight: number, widgetWidth: number, widgetHeight: number,
  desired: WidgetPosition, occupied: WidgetRect[], protectedControls: WidgetRect[] = [],
): WidgetPosition {
  const gap = 12
  const start = clampWidgetPosition(boundsWidth, boundsHeight, widgetWidth, widgetHeight, desired.x, desired.y)
  const maxX = Math.max(gap, boundsWidth - widgetWidth - gap)
  const maxY = Math.max(gap, boundsHeight - widgetHeight - gap)
  const obstacles = [...occupied, ...protectedControls]
  const xs = [start.x, gap, maxX, ...obstacles.flatMap(rect => [rect.x - widgetWidth - gap, rect.x + rect.width + gap])]
  const ys = [start.y, gap, maxY, ...obstacles.flatMap(rect => [rect.y - widgetHeight - gap, rect.y + rect.height + gap])]
  const candidates = xs.flatMap(x => ys.map(y => clampWidgetPosition(boundsWidth, boundsHeight,
    widgetWidth, widgetHeight, x, y)))
  const overlap = (position: WidgetPosition, rect: WidgetRect) =>
    Math.max(0, Math.min(position.x + widgetWidth + gap, rect.x + rect.width + gap) - Math.max(position.x, rect.x)) *
    Math.max(0, Math.min(position.y + widgetHeight + gap, rect.y + rect.height + gap) - Math.max(position.y, rect.y))
  candidates.sort((a, b) => {
    const score = (position: WidgetPosition) =>
      protectedControls.reduce((area, rect) => area + overlap(position, rect), 0) * 1_000_000 +
      occupied.reduce((area, rect) => area + overlap(position, rect), 0) * 1000 +
      (position.x - start.x) ** 2 + (position.y - start.y) ** 2
    return score(a) - score(b)
  })
  return candidates[0] ?? start
}

/** Default spawn position: horizontally centered, below the HUD header. */
export function clampWidgetPosition(
  boundsWidth: number,
  boundsHeight: number,
  widgetWidth: number,
  widgetHeight: number,
  x: number,
  y: number,
): WidgetPosition {
  const maxX = Math.max(EDGE_INSET, boundsWidth - widgetWidth - EDGE_INSET)
  const maxY = Math.max(EDGE_INSET, boundsHeight - widgetHeight - EDGE_INSET)
  return {
    x: Math.max(EDGE_INSET, Math.min(maxX, x)),
    y: Math.max(EDGE_INSET, Math.min(maxY, y)),
  }
}

export function getFloatingWidgetTopCenter(
  boundsWidth: number,
  boundsHeight: number,
  widgetWidth: number,
  widgetHeight: number,
  topOffset = 72,
): WidgetPosition {
  const maxX = Math.max(EDGE_INSET, boundsWidth - widgetWidth - EDGE_INSET)
  const x = Math.max(EDGE_INSET, Math.min(maxX, (boundsWidth - widgetWidth) / 2))
  const maxY = Math.max(EDGE_INSET, boundsHeight - widgetHeight - EDGE_INSET)
  const y = Math.max(EDGE_INSET, Math.min(maxY, topOffset))
  return { x, y }
}

/**
 * Widget positions live in localStorage so a dragged metronome or drone is
 * still where it was left after a relaunch — the desk stays set overnight.
 */
export function loadWidgetPosition(id: string): WidgetPosition | null {
  try {
    const raw = localStorage.getItem(`${POSITION_STORAGE_PREFIX}${id}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WidgetPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

export function saveWidgetPosition(id: string, x: number, y: number): void {
  try {
    localStorage.setItem(
      `${POSITION_STORAGE_PREFIX}${id}`,
      JSON.stringify({ x: Math.round(x), y: Math.round(y) }),
    )
  } catch {
    /* private mode / quota */
  }
}

/** Persistent positions for user-arranged UI that should survive an app relaunch. */
export function loadPersistentWidgetPosition(id: string): WidgetPosition | null {
  try {
    const raw = localStorage.getItem(`${PERSISTENT_POSITION_STORAGE_PREFIX}${id}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WidgetPosition> & { userPlaced?: boolean; viewportWidth?: number; viewportHeight?: number }
    if (!parsed.userPlaced) return null // Older offsets may have been saved by startup clamping.
    if (typeof window !== 'undefined' && (Math.abs((parsed.viewportWidth ?? 0) - window.innerWidth) > 80 || Math.abs((parsed.viewportHeight ?? 0) - window.innerHeight) > 200)) return null
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

export function savePersistentWidgetPosition(id: string, x: number, y: number): void {
  try {
    localStorage.setItem(
      `${PERSISTENT_POSITION_STORAGE_PREFIX}${id}`,
      JSON.stringify({ x: Math.round(x), y: Math.round(y), userPlaced: true, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }),
    )
  } catch {
    /* private mode / quota */
  }
}

export interface WidgetSize {
  width: number
  height: number
}

export function loadWidgetSize(id: string): WidgetSize | null {
  try {
    const raw = sessionStorage.getItem(`${SIZE_STORAGE_PREFIX}${id}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WidgetSize>
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return null
    if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return null
    return { width: parsed.width, height: parsed.height }
  } catch {
    return null
  }
}

export function saveWidgetSize(id: string, width: number, height: number): void {
  try {
    sessionStorage.setItem(
      `${SIZE_STORAGE_PREFIX}${id}`,
      JSON.stringify({ width: Math.round(width), height: Math.round(height) }),
    )
  } catch {
    /* private mode / quota */
  }
}

/** Pick the closest free slot, including when saved positions collide after rotation. */
export function findAvailableWidgetBallPosition(
  width: number, height: number, desired: WidgetPosition, occupied: WidgetPosition[],
): WidgetPosition {
  const size = 56
  const gap = 12
  const start = clampWidgetPosition(width, height, size, size, desired.x, desired.y)
  const free = (p: WidgetPosition) => occupied.every(other =>
    Math.abs(p.x - other.x) >= size + gap || Math.abs(p.y - other.y) >= size + gap)
  if (free(start)) return start
  const candidates: WidgetPosition[] = []
  const maxX = Math.max(12, width - size - 12)
  const maxY = Math.max(12, height - size - 12)
  const xs = [start.x, 12, maxX]
  const ys = [start.y, 12, maxY]
  for (let x = maxX; x >= 12; x -= size + gap) xs.push(x)
  for (let y = maxY; y >= 12; y -= size + gap) ys.push(y)
  for (const x of xs) for (const y of ys) candidates.push({ x, y })
  candidates.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y))
  return candidates.find(free) ?? start
}

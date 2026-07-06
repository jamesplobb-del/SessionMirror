const EDGE_INSET = 12
const POSITION_STORAGE_PREFIX = 'sessionmirror:widget-pos:'
const SIZE_STORAGE_PREFIX = 'sessionmirror:widget-size:'

export interface WidgetPosition {
  x: number
  y: number
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

export function loadWidgetPosition(id: string): WidgetPosition | null {
  try {
    const raw = sessionStorage.getItem(`${POSITION_STORAGE_PREFIX}${id}`)
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
    sessionStorage.setItem(
      `${POSITION_STORAGE_PREFIX}${id}`,
      JSON.stringify({ x: Math.round(x), y: Math.round(y) }),
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

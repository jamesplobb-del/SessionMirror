const EDGE_INSET = 12
const POSITION_STORAGE_PREFIX = 'sessionmirror:widget-pos:'

export interface WidgetPosition {
  x: number
  y: number
}

/** Default spawn position: horizontally centered, below the HUD header. */
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

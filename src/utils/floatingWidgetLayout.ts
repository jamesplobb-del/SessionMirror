const EDGE_INSET = 12

/** Default spawn position: horizontally centered, below the HUD header. */
export function getFloatingWidgetTopCenter(
  boundsWidth: number,
  boundsHeight: number,
  widgetWidth: number,
  widgetHeight: number,
  topOffset = 72,
): { x: number; y: number } {
  const maxX = Math.max(EDGE_INSET, boundsWidth - widgetWidth - EDGE_INSET)
  const x = Math.max(EDGE_INSET, Math.min(maxX, (boundsWidth - widgetWidth) / 2))
  const maxY = Math.max(EDGE_INSET, boundsHeight - widgetHeight - EDGE_INSET)
  const y = Math.max(EDGE_INSET, Math.min(maxY, topOffset))
  return { x, y }
}

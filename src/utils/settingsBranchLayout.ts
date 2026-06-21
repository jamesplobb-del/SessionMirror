interface ViewportPoint {
  x: number
  y: number
}

/** Icon + label stack — keep in sync with SettingsBranchWheel markup. */
const ITEM_WIDTH = 96
const ITEM_HEIGHT = 92
const ITEM_GAP = 12
/** Space between cog top and nearest branch row. */
const COG_CLEARANCE = 20
const DECK_TEXT_CLEARANCE = 28
const VIEWPORT_MARGIN = 12

function clampBranchPoint(
  point: ViewportPoint,
  anchorRect: DOMRect,
): ViewportPoint {
  const anchorCenterX = anchorRect.left + anchorRect.width / 2
  const anchorCenterY = anchorRect.top + anchorRect.height / 2
  const centerX = anchorCenterX + point.x
  const centerY = anchorCenterY + point.y

  const halfW = ITEM_WIDTH / 2
  const halfH = ITEM_HEIGHT / 2
  const minCenterX = VIEWPORT_MARGIN + halfW
  const maxCenterX = window.innerWidth - VIEWPORT_MARGIN - halfW
  const minCenterY = VIEWPORT_MARGIN + halfH
  const maxCenterY = window.innerHeight - VIEWPORT_MARGIN - halfH

  return {
    x: Math.min(maxCenterX, Math.max(minCenterX, centerX)) - anchorCenterX,
    y: Math.min(maxCenterY, Math.max(minCenterY, centerY)) - anchorCenterY,
  }
}

/** Two quick-setting boxes in one row above the settings cog. */
export function layoutBranchItems(count: number, anchorRect: DOMRect): ViewportPoint[] {
  const rowCenterY = -(COG_CLEARANCE + DECK_TEXT_CLEARANCE + ITEM_HEIGHT / 2)
  const totalWidth = count * ITEM_WIDTH + (count - 1) * ITEM_GAP
  const startX = -totalWidth / 2 + ITEM_WIDTH / 2

  return Array.from({ length: count }, (_, index) =>
    clampBranchPoint(
      {
        x: startX + index * (ITEM_WIDTH + ITEM_GAP),
        y: rowCenterY,
      },
      anchorRect,
    ),
  )
}

export const BRANCH_ITEM_WIDTH = ITEM_WIDTH

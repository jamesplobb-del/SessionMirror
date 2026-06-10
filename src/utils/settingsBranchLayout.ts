interface ViewportPoint {
  x: number
  y: number
}

const ITEM_WIDTH = 88
const ITEM_HEIGHT = 68
const ITEM_GAP = 12
const COG_CLEARANCE = 56
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

/** Lay out branches in a row centered above the settings cog. */
export function layoutBranchItems(count: number, anchorRect: DOMRect): ViewportPoint[] {
  const baseY = -(COG_CLEARANCE + ITEM_HEIGHT / 2)

  if (count <= 1) {
    return [clampBranchPoint({ x: 0, y: baseY }, anchorRect)]
  }

  const totalWidth = ITEM_WIDTH * count + ITEM_GAP * (count - 1)
  const startX = -totalWidth / 2 + ITEM_WIDTH / 2

  return Array.from({ length: count }, (_, index) =>
    clampBranchPoint(
      {
        x: startX + index * (ITEM_WIDTH + ITEM_GAP),
        y: baseY,
      },
      anchorRect,
    ),
  )
}

export const BRANCH_ITEM_WIDTH = ITEM_WIDTH

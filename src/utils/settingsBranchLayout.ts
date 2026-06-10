interface ViewportPoint {
  x: number
  y: number
}

const ITEM_WIDTH = 88
const ITEM_HEIGHT = 68
const ITEM_GAP = 12
const COG_CLEARANCE = 52
const VIEWPORT_MARGIN = 10

function clampBranchPoint(
  point: ViewportPoint,
  anchorRect: DOMRect,
): ViewportPoint {
  const centerX = anchorRect.left + anchorRect.width / 2 + point.x
  const centerY = anchorRect.top + anchorRect.height / 2 + point.y

  const minCenterX = VIEWPORT_MARGIN + ITEM_WIDTH / 2
  const maxCenterX = window.innerWidth - VIEWPORT_MARGIN - ITEM_WIDTH / 2
  const minCenterY = VIEWPORT_MARGIN + ITEM_HEIGHT / 2
  const maxCenterY = window.innerHeight - VIEWPORT_MARGIN - ITEM_HEIGHT / 2

  const clampedCenterX = Math.min(maxCenterX, Math.max(minCenterX, centerX))
  const clampedCenterY = Math.min(maxCenterY, Math.max(minCenterY, centerY))

  return {
    x: clampedCenterX - (anchorRect.left + anchorRect.width / 2),
    y: clampedCenterY - (anchorRect.top + anchorRect.height / 2),
  }
}

/** Lay out quick-setting branches above the settings cog, biased left on screen. */
export function layoutBranchItems(count: number, anchorRect: DOMRect): ViewportPoint[] {
  const liftY = -(COG_CLEARANCE + ITEM_HEIGHT / 2)

  if (count <= 1) {
    return [clampBranchPoint({ x: -ITEM_WIDTH * 0.55, y: liftY }, anchorRect)]
  }

  const rowWidth = ITEM_WIDTH * count + ITEM_GAP * (count - 1)
  const startX = -rowWidth + ITEM_WIDTH / 2

  return Array.from({ length: count }, (_, index) =>
    clampBranchPoint(
      {
        x: startX + index * (ITEM_WIDTH + ITEM_GAP),
        y: liftY,
      },
      anchorRect,
    ),
  )
}

export const BRANCH_ITEM_WIDTH = ITEM_WIDTH

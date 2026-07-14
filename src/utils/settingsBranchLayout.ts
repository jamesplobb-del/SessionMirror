interface ViewportPoint {
  x: number
  y: number
}

/** Icon + label stack — keep in sync with SettingsBranchWheel markup. */
const ITEM_WIDTH = 104
const ITEM_HEIGHT = 90
const ITEM_GAP = 10
const COG_CLEARANCE = 20
const DECK_TEXT_CLEARANCE = 28
const VIEWPORT_MARGIN = 16

export type SettingsBranchLayoutMode = 'camera' | 'audio' | 'tuner'

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
  const visualViewport = window.visualViewport
  const viewportLeft = visualViewport?.offsetLeft ?? 0
  const viewportTop = visualViewport?.offsetTop ?? 0
  const viewportWidth = visualViewport?.width ?? window.innerWidth
  const viewportHeight = visualViewport?.height ?? window.innerHeight
  const minCenterX = viewportLeft + VIEWPORT_MARGIN + halfW
  const maxCenterX = viewportLeft + viewportWidth - VIEWPORT_MARGIN - halfW
  const minCenterY = viewportTop + VIEWPORT_MARGIN + halfH
  const maxCenterY = viewportTop + viewportHeight - VIEWPORT_MARGIN - halfH

  return {
    x: Math.min(maxCenterX, Math.max(minCenterX, centerX)) - anchorCenterX,
    y: Math.min(maxCenterY, Math.max(minCenterY, centerY)) - anchorCenterY,
  }
}

/** Stack quick settings vertically above the settings anchor. */
export function layoutBranchItems(
  count: number,
  anchorRect: DOMRect,
  _mode: SettingsBranchLayoutMode = 'camera',
): ViewportPoint[] {
  const visualViewport = window.visualViewport
  const viewportTop = visualViewport?.offsetTop ?? 0
  const minCenterY = viewportTop + VIEWPORT_MARGIN + ITEM_HEIGHT / 2
  const anchorCenterY = anchorRect.top + anchorRect.height / 2
  const itemStep = ITEM_HEIGHT + ITEM_GAP
  const desiredNearestCenterY =
    anchorCenterY - (COG_CLEARANCE + DECK_TEXT_CLEARANCE + ITEM_HEIGHT / 2)
  const desiredFarthestCenterY = desiredNearestCenterY - Math.max(0, count - 1) * itemStep
  const stackShiftY = Math.max(0, minCenterY - desiredFarthestCenterY)

  return Array.from({ length: count }, (_, index) => {
    const stackFromCog = count - 1 - index
    return clampBranchPoint(
      {
        x: 0,
        y:
          desiredNearestCenterY + stackShiftY - anchorCenterY - stackFromCog * itemStep,
      },
      anchorRect,
    )
  })
}

export const BRANCH_ITEM_WIDTH = ITEM_WIDTH

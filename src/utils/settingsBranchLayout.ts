interface ViewportPoint {
  x: number
  y: number
}

export interface BranchLayout {
  /** Item centers, relative to the wheel's own origin (viewport center). */
  positions: ViewportPoint[]
  /** Palette card size, in px — sized to wrap the items plus BOX_PADDING, not
   * a fixed constant. A count that needs more room gets a bigger card. */
  boxWidth: number
  boxHeight: number
  /** Palette card center, relative to the wheel's origin. */
  boxCenter: ViewportPoint
}

const VIEWPORT_MARGIN = 16

/** Clear space between an item's outer edge and the palette card's edge. */
const BOX_PADDING = 16

export type SettingsBranchLayoutMode = 'camera' | 'audio' | 'tuner'

// ─────────────────────────────────────────────────────────────────────────
// Camera: a dice-face cluster (corners + a center pip for 5) centered on
// screen. The card is sized to exactly wrap whichever face is showing, so a
// 4-item face gets a snugger card than a 5-item one instead of both sharing
// one fixed box that's either too tight or mostly empty.
// ─────────────────────────────────────────────────────────────────────────

const CAMERA_ITEM_WIDTH = 88
const CAMERA_ITEM_HEIGHT = 84

/** Px per dice-grid unit. Chosen so the 5-face's tightest pair (center vs. a
 * corner, which are 1 unit apart vertically) still clears with a visible
 * gap: UNIT − CAMERA_ITEM_HEIGHT = 98 − 84 = 14px. */
const DICE_UNIT = 98

/**
 * Dice-face arrangements, in grid units from the centre. A palette of 5 reads
 * as the "5" pip face — four corners plus a centre — which stays symmetrical
 * instead of leaving a lone orphan on a trailing row. Counts either side of 5
 * use the matching die face for the same reason.
 */
const DICE_FACES: Record<number, ViewportPoint[]> = {
  1: [{ x: 0, y: 0 }],
  2: [
    { x: -0.5, y: 0 },
    { x: 0.5, y: 0 },
  ],
  3: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
  4: [
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
    { x: -0.5, y: 0.5 },
    { x: 0.5, y: 0.5 },
  ],
  5: [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 0, y: 0 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
  ],
  6: [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
  ],
}

/** Index of a face's centre pip, or null when the face has none. */
export function diceCenterSlot(count: number): number | null {
  const face = DICE_FACES[count]
  if (!face) return null
  const index = face.findIndex(({ x, y }) => x === 0 && y === 0)
  return index >= 0 ? index : null
}

function boxFromPositions(
  positions: ViewportPoint[],
  itemWidth: number,
  itemHeight: number,
): { boxWidth: number; boxHeight: number } {
  let maxAbsX = 0
  let maxAbsY = 0
  for (const { x, y } of positions) {
    maxAbsX = Math.max(maxAbsX, Math.abs(x))
    maxAbsY = Math.max(maxAbsY, Math.abs(y))
  }
  return {
    boxWidth: 2 * (maxAbsX + itemWidth / 2 + BOX_PADDING),
    boxHeight: 2 * (maxAbsY + itemHeight / 2 + BOX_PADDING),
  }
}

function layoutCameraGrid(count: number): BranchLayout {
  const face = DICE_FACES[count]
  const positions = face
    ? face.map(({ x, y }) => ({ x: x * DICE_UNIT, y: y * DICE_UNIT }))
    : layoutFallbackGrid(count, CAMERA_ITEM_WIDTH, CAMERA_ITEM_HEIGHT)

  const { boxWidth, boxHeight } = boxFromPositions(
    positions,
    CAMERA_ITEM_WIDTH,
    CAMERA_ITEM_HEIGHT,
  )
  return { positions, boxWidth, boxHeight, boxCenter: { x: 0, y: 0 } }
}

/** Balanced 2-column grid for counts the dice table doesn't define (7+). */
function layoutFallbackGrid(
  count: number,
  itemWidth: number,
  itemHeight: number,
): ViewportPoint[] {
  const columns = 2
  const columnStep = itemWidth + 14
  const rowStep = itemHeight + 14
  const rowCount = Math.ceil(count / columns)
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    const itemsInRow = Math.min(columns, count - row * columns)
    return {
      x: (column - (itemsInRow - 1) / 2) * columnStep,
      y: (row - (rowCount - 1) / 2) * rowStep,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Audio / Tuner ("Tools"): a plain vertical list, card sized to wrap it and
// popped up above the control deck.
// ─────────────────────────────────────────────────────────────────────────

const TOOLS_ITEM_WIDTH = 112
const TOOLS_ITEM_HEIGHT = 88
const TOOLS_ITEM_GAP = 10
/** Clearance between the palette card's bottom edge and the control deck. */
const TOOLS_DECK_CLEARANCE = 26

function layoutToolsList(count: number, anchorRect: DOMRect): BranchLayout {
  const itemStep = TOOLS_ITEM_HEIGHT + TOOLS_ITEM_GAP
  const positions = Array.from({ length: count }, (_, index) => ({
    x: 0,
    y: (index - (count - 1) / 2) * itemStep,
  }))

  const boxWidth = TOOLS_ITEM_WIDTH + 2 * BOX_PADDING
  const boxHeight = count * TOOLS_ITEM_HEIGHT + Math.max(0, count - 1) * TOOLS_ITEM_GAP + 2 * BOX_PADDING

  // The wheel's own origin sits at viewport center (see SettingsBranchWheel);
  // everything here is computed in that same coordinate space, so the deck's
  // screen position has to be converted to a delta from that center first.
  const visualViewport = window.visualViewport
  const viewportLeft = visualViewport?.offsetLeft ?? 0
  const viewportTop = visualViewport?.offsetTop ?? 0
  const viewportWidth = visualViewport?.width ?? window.innerWidth
  const viewportHeight = visualViewport?.height ?? window.innerHeight
  const wheelOriginX = viewportLeft + viewportWidth / 2
  const wheelOriginY = viewportTop + viewportHeight / 2

  const desiredBoxBottom = anchorRect.top - TOOLS_DECK_CLEARANCE
  const desiredBoxCenterY = desiredBoxBottom - boxHeight / 2
  const minBoxCenterY = viewportTop + VIEWPORT_MARGIN + boxHeight / 2
  const boxCenterYAbsolute = Math.max(minBoxCenterY, desiredBoxCenterY)
  const boxCenterY = boxCenterYAbsolute - wheelOriginY

  const halfBoxWidth = boxWidth / 2
  const minCenterXAbsolute = viewportLeft + VIEWPORT_MARGIN + halfBoxWidth
  const maxCenterXAbsolute = viewportLeft + viewportWidth - VIEWPORT_MARGIN - halfBoxWidth
  const boxCenterXAbsolute = Math.min(
    maxCenterXAbsolute,
    Math.max(minCenterXAbsolute, wheelOriginX),
  )
  const boxCenterX = boxCenterXAbsolute - wheelOriginX

  return {
    positions: positions.map((point) => ({ x: point.x + boxCenterX, y: point.y + boxCenterY })),
    boxWidth,
    boxHeight,
    boxCenter: { x: boxCenterX, y: boxCenterY },
  }
}

/** Camera uses a centered dice cluster; audio and tuner use an anchored vertical list. */
export function computeBranchLayout(
  count: number,
  anchorRect: DOMRect,
  mode: SettingsBranchLayoutMode = 'camera',
): BranchLayout {
  if (count === 0) return { positions: [], boxWidth: 0, boxHeight: 0, boxCenter: { x: 0, y: 0 } }
  return mode === 'camera' ? layoutCameraGrid(count) : layoutToolsList(count, anchorRect)
}

export const CAMERA_BRANCH_ITEM_WIDTH = CAMERA_ITEM_WIDTH
export const CAMERA_BRANCH_ITEM_HEIGHT = CAMERA_ITEM_HEIGHT
export const TOOLS_BRANCH_ITEM_WIDTH = TOOLS_ITEM_WIDTH
export const TOOLS_BRANCH_ITEM_HEIGHT = TOOLS_ITEM_HEIGHT

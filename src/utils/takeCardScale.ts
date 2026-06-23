const PIP_BASE_REM = 9.5
const PIP_GAP_PX = 24
const PIP_PADDING_PX = 32
const SAFE_MARGIN_PX = 16

export const TAKE_CARD_SCALE_MIN = 85
export const TAKE_CARD_SCALE_DEFAULT = 105
export const TAKE_CARD_SCALE_ABSOLUTE_MAX = 115
export const TAKE_CARD_SCALE_STEP = 5

function rootFontPx(): number {
  if (typeof document === 'undefined') return 16
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

/** Largest card scale (%) that keeps both PiP cards on screen. */
export function getMaxTakeCardScalePercent(viewportWidth?: number): number {
  if (typeof window === 'undefined') return TAKE_CARD_SCALE_ABSOLUTE_MAX

  const width = viewportWidth ?? window.innerWidth
  const basePx = PIP_BASE_REM * rootFontPx()
  const available = width - PIP_GAP_PX - PIP_PADDING_PX - SAFE_MARGIN_PX
  const maxScale = available / (2 * basePx)
  const maxPercent = Math.floor(maxScale * 100)
  const stepped = Math.floor(maxPercent / TAKE_CARD_SCALE_STEP) * TAKE_CARD_SCALE_STEP

  return Math.max(
    TAKE_CARD_SCALE_MIN,
    Math.min(TAKE_CARD_SCALE_ABSOLUTE_MAX, stepped),
  )
}

export function clampTakeCardScale(
  value: number,
  viewportWidth?: number,
): number {
  const max = getMaxTakeCardScalePercent(viewportWidth)
  const stepped = Math.round(value / TAKE_CARD_SCALE_STEP) * TAKE_CARD_SCALE_STEP
  return Math.min(max, Math.max(TAKE_CARD_SCALE_MIN, stepped))
}

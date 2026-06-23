const PIP_BASE_REM = 9.5
const PIP_GAP_PX = 24
const PIP_PADDING_PX = 32
const SAFE_MARGIN_PX = 16

/** UI slider range — 100% display matches the former 105% visual size. */
export const TAKE_CARD_SCALE_MIN = 85
export const TAKE_CARD_SCALE_DEFAULT = 100
export const TAKE_CARD_SCALE_ABSOLUTE_MAX = 125
export const TAKE_CARD_SCALE_STEP = 5

/** Former default (105) maps to display 100%; CSS multiplier = display% × this / 100. */
const TAKE_CARD_SCALE_VISUAL_BASE = 1.05

function rootFontPx(): number {
  if (typeof document === 'undefined') return 16
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export function takeCardScaleToMultiplier(displayPercent: number): number {
  return (displayPercent / 100) * TAKE_CARD_SCALE_VISUAL_BASE
}

/** Remap stored values from the old 1:1 scale (default 105) to the new display scale. */
export function migrateTakeCardScaleStored(stored: number): number {
  const raw = Number.isFinite(stored) ? stored : TAKE_CARD_SCALE_DEFAULT
  const stepped = Math.round(raw / TAKE_CARD_SCALE_STEP) * TAKE_CARD_SCALE_STEP
  const display =
    stepped >= 85 && stepped <= 125
      ? Math.round((stepped * 100) / 105 / TAKE_CARD_SCALE_STEP) * TAKE_CARD_SCALE_STEP
      : stepped
  return clampTakeCardScale(display)
}

/** Largest card scale (%) that keeps both PiP cards on screen. */
export function getMaxTakeCardScalePercent(viewportWidth?: number): number {
  if (typeof window === 'undefined') return TAKE_CARD_SCALE_ABSOLUTE_MAX

  const width = viewportWidth ?? window.innerWidth
  const basePx = PIP_BASE_REM * rootFontPx()
  const available = width - PIP_GAP_PX - PIP_PADDING_PX - SAFE_MARGIN_PX
  const maxMultiplier = available / (2 * basePx)
  const maxDisplay = Math.floor((maxMultiplier / TAKE_CARD_SCALE_VISUAL_BASE) * 100)
  const stepped = Math.floor(maxDisplay / TAKE_CARD_SCALE_STEP) * TAKE_CARD_SCALE_STEP

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

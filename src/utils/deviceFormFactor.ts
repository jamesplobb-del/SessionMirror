/** iPad mini portrait width — iPhone Pro Max is 430px, so this never matches phones. */
export const TABLET_MIN_VIEWPORT_WIDTH = 744

export function isTabletViewport(width = readViewportWidth()): boolean {
  return width >= TABLET_MIN_VIEWPORT_WIDTH
}

function readViewportWidth(): number {
  if (typeof window === 'undefined') return 0
  return Math.round(window.innerWidth)
}

export function syncFormFactorClass(width = readViewportWidth()): boolean {
  if (typeof document === 'undefined') return false

  const tablet = isTabletViewport(width)
  document.documentElement.classList.toggle('form-factor-tablet', tablet)
  return tablet
}

/** iPad mini portrait width — iPhone Pro Max is 430px, so this never matches phones. */
export const TABLET_MIN_VIEWPORT_WIDTH = 744

export function isTabletViewport(width = readViewportWidth()): boolean {
  return width >= TABLET_MIN_VIEWPORT_WIDTH
}

/**
 * A tablet, whatever shape the window happens to be.
 *
 * `isTabletViewport` answers a layout question and moves with split view and
 * slide-over, which is right for layout and wrong for anything about the
 * hardware. The screen's short side is the device: an iPad mini is 744 across
 * even held sideways, and the largest iPhone is 440.
 */
export function isTabletDevice(): boolean {
  if (typeof window === 'undefined' || !window.screen) return false
  const { width, height } = window.screen
  if (!(width > 0) || !(height > 0)) return false
  return Math.min(width, height) >= TABLET_MIN_VIEWPORT_WIDTH
}

export function subscribeFormFactor(onChange: () => void): () => void {
  window.addEventListener('resize', onChange)
  window.visualViewport?.addEventListener('resize', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
    window.visualViewport?.removeEventListener('resize', onChange)
  }
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

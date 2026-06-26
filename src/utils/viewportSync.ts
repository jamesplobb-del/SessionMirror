import { Capacitor } from '@capacitor/core'
import { syncFormFactorClass } from './deviceFormFactor'

export function isIOSNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

function markPlatformClass(): void {
  if (isIOSNative()) {
    document.documentElement.classList.add('platform-ios')
  }
}

let cachedSafeAreaInsets: { top: number; bottom: number } | null = null
let lastAppliedWidth = 0
let lastAppliedHeight = 0

function readSafeAreaInsets(): { top: number; bottom: number } {
  if (cachedSafeAreaInsets) return cachedSafeAreaInsets

  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.documentElement.appendChild(probe)
  const style = getComputedStyle(probe)
  cachedSafeAreaInsets = {
    top: parseFloat(style.paddingTop) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
  }
  document.documentElement.removeChild(probe)
  return cachedSafeAreaInsets
}

export function readViewportSize(): { width: number; height: number } {
  const visualViewport = window.visualViewport
  if (visualViewport) {
    return {
      width: Math.round(visualViewport.width),
      height: Math.round(visualViewport.height),
    }
  }

  return {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
  }
}

/** HUD layout vars only — live camera uses orientation-stable CSS, not these. */
export function applyViewportCssVars(): number {
  const { width, height } = readViewportSize()
  if (width === lastAppliedWidth && height === lastAppliedHeight) {
    return height
  }

  lastAppliedWidth = width
  lastAppliedHeight = height

  const root = document.documentElement
  root.style.setProperty('--viewport-width', `${width}px`)
  root.style.setProperty('--viewport-height', `${height}px`)
  root.style.setProperty('--app-height', `${height}px`)

  const safe = readSafeAreaInsets()
  root.style.setProperty('--safe-top-js', `${safe.top}px`)
  root.style.setProperty('--safe-bottom-js', `${safe.bottom}px`)

  syncFormFactorClass(width)

  return height
}

export function isOrientationTransitionActive(): boolean {
  return false
}

export function bootstrapViewport(): void {
  markPlatformClass()
  applyViewportCssVars()
}

export function applyViewportCssVarsOnResume(): number {
  lastAppliedWidth = 0
  lastAppliedHeight = 0
  cachedSafeAreaInsets = null
  return applyViewportCssVars()
}

/** Reset scroll + viewport CSS vars after inline video / PiP interaction (iOS zoom glitch). */
export function stabilizeViewportAfterMediaInteraction(): void {
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
  applyViewportCssVarsOnResume()
  requestAnimationFrame(() => {
    applyViewportCssVarsOnResume()
  })
}

export function refreshCameraPreviewLayout(_video: HTMLVideoElement | null): void {
  /* Preview layout is CSS-only — never touch srcObject or play() on orientation. */
}

export function scheduleViewportSync(onHeightChange: (height: number) => void): () => void {
  markPlatformClass()

  const sync = () => {
    onHeightChange(applyViewportCssVars())
  }

  sync()

  let debounceTimer: number | null = null
  const scheduleSync = () => {
    const scale = window.visualViewport?.scale ?? 1
    if (Math.abs(scale - 1) > 0.01) return

    if (debounceTimer !== null) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null
      sync()
    }, 80)
  }

  window.addEventListener('resize', scheduleSync)
  window.visualViewport?.addEventListener('resize', scheduleSync)

  let capCleanup: (() => void) | undefined
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return
        applyViewportCssVarsOnResume()
        sync()
      }).then((sub) => {
        capCleanup = () => {
          void sub.remove()
        }
      })
    })
  }

  return () => {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer)
    window.removeEventListener('resize', scheduleSync)
    window.visualViewport?.removeEventListener('resize', scheduleSync)
    capCleanup?.()
    lastAppliedWidth = 0
    lastAppliedHeight = 0
    cachedSafeAreaInsets = null
  }
}

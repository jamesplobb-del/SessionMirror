import { Capacitor } from '@capacitor/core'

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
  return {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
  }
}

/** HUD layout vars only — live camera uses fixed 100dvh and ignores these. */
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
  root.style.setProperty('--camera-fill-height', `${height}px`)
  root.style.setProperty('--app-height', `${height}px`)

  const safe = readSafeAreaInsets()
  root.style.setProperty('--safe-top-js', `${safe.top}px`)
  root.style.setProperty('--safe-bottom-js', `${safe.bottom}px`)

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

export function refreshCameraPreviewLayout(video: HTMLVideoElement | null): void {
  if (!video || !video.srcObject) return
  if (video.paused) {
    void video.play().catch(() => {})
  }
}

export function scheduleViewportSync(onHeightChange: (height: number) => void): () => void {
  markPlatformClass()

  const sync = () => {
    onHeightChange(applyViewportCssVars())
  }

  sync()

  let orientationTimer: number | null = null
  const onOrientationChange = () => {
    if (orientationTimer !== null) {
      window.clearTimeout(orientationTimer)
    }
    orientationTimer = window.setTimeout(() => {
      orientationTimer = null
      cachedSafeAreaInsets = null
      sync()
    }, 400)
  }

  window.addEventListener('orientationchange', onOrientationChange)

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
    if (orientationTimer !== null) {
      window.clearTimeout(orientationTimer)
    }
    window.removeEventListener('orientationchange', onOrientationChange)
    capCleanup?.()
    lastAppliedWidth = 0
    lastAppliedHeight = 0
    cachedSafeAreaInsets = null
  }
}

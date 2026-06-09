import { Capacitor } from '@capacitor/core'

/** iOS reports safe-area via env(); probe once per sync for JS height math. */
function readSafeAreaInsets(): { top: number; bottom: number } {
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.documentElement.appendChild(probe)
  const style = getComputedStyle(probe)
  const insets = {
    top: parseFloat(style.paddingTop) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
  }
  document.documentElement.removeChild(probe)
  return insets
}

export function readViewportSize(): { width: number; height: number } {
  const vv = window.visualViewport
  const offsetTop = vv?.offsetTop ?? 0
  const offsetLeft = vv?.offsetLeft ?? 0

  // visualViewport.height omits offsetTop on cold boot — add it so bottom-anchored fill reaches the bezel.
  const vvHeight = (vv?.height ?? 0) + offsetTop
  const vvWidth = (vv?.width ?? 0) + offsetLeft

  const heightCandidates = [
    window.innerHeight,
    document.documentElement.clientHeight,
    vvHeight,
    vv?.height ?? 0,
  ].filter((value) => value > 0)

  const widthCandidates = [
    window.innerWidth,
    document.documentElement.clientWidth,
    vvWidth,
    vv?.width ?? 0,
  ].filter((value) => value > 0)

  return {
    width: Math.round(Math.max(...widthCandidates)),
    height: Math.round(Math.max(...heightCandidates)),
  }
}

/** Apply live viewport dimensions — matches what iOS settles on after rotation. */
export function applyViewportCssVars(): number {
  const { width, height } = readViewportSize()
  const vv = window.visualViewport
  const root = document.documentElement

  root.style.setProperty('--viewport-width', `${width}px`)
  root.style.setProperty('--viewport-height', `${height}px`)
  root.style.setProperty('--camera-fill-height', `${height}px`)
  root.style.setProperty('--app-height', `${height}px`)
  root.style.setProperty('--vv-offset-top', `${vv?.offsetTop ?? 0}px`)
  root.style.setProperty('--vv-offset-left', `${vv?.offsetLeft ?? 0}px`)

  const safe = readSafeAreaInsets()
  root.style.setProperty('--safe-top-js', `${safe.top}px`)
  root.style.setProperty('--safe-bottom-js', `${safe.bottom}px`)

  document.body.style.width = `${width}px`
  document.body.style.height = `${height}px`

  // Nudge WebKit layout after dimension changes.
  void document.body.offsetHeight

  return height
}

export function refreshCameraPreviewLayout(video: HTMLVideoElement | null): void {
  applyViewportCssVars()
  if (!video || !video.srcObject) return
  void video.play().catch(() => {})
}

const BOOT_SYNC_DELAYS_MS = [0, 50, 100, 250, 500, 750, 1000, 1500, 2000]

function syncWithRaf(sync: () => void): void {
  requestAnimationFrame(() => {
    sync()
    requestAnimationFrame(sync)
  })
}

async function setupCapacitorResumeSync(sync: () => void): Promise<(() => void) | undefined> {
  if (!Capacitor.isNativePlatform()) return undefined

  const { App } = await import('@capacitor/app')
  const sub = await App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return
    sync()
    syncWithRaf(sync)
    window.setTimeout(sync, 100)
    window.setTimeout(sync, 300)
  })

  return () => {
    void sub.remove()
  }
}

export function scheduleViewportSync(onHeightChange: (height: number) => void): () => void {
  const sync = () => onHeightChange(applyViewportCssVars())

  const timers = BOOT_SYNC_DELAYS_MS.map((delay) => window.setTimeout(sync, delay))

  const onOrientationChange = () => {
    sync()
    syncWithRaf(sync)
    window.setTimeout(sync, 100)
    window.setTimeout(sync, 300)
  }

  const onPageShow = () => {
    sync()
    syncWithRaf(sync)
  }

  sync()
  syncWithRaf(sync)
  window.addEventListener('resize', sync)
  window.addEventListener('orientationchange', onOrientationChange)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', sync)
  window.visualViewport?.addEventListener('resize', sync)
  window.visualViewport?.addEventListener('scroll', sync)

  let capCleanup: (() => void) | undefined
  void setupCapacitorResumeSync(sync).then((cleanup) => {
    capCleanup = cleanup
  })

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer))
    window.removeEventListener('resize', sync)
    window.removeEventListener('orientationchange', onOrientationChange)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('focus', sync)
    window.visualViewport?.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('scroll', sync)
    capCleanup?.()
    rootCleanup()
  }
}

function rootCleanup(): void {
  const root = document.documentElement
  root.style.removeProperty('--viewport-width')
  root.style.removeProperty('--viewport-height')
  root.style.removeProperty('--camera-fill-height')
  root.style.removeProperty('--app-height')
  root.style.removeProperty('--vv-offset-top')
  root.style.removeProperty('--vv-offset-left')
  root.style.removeProperty('--safe-top-js')
  root.style.removeProperty('--safe-bottom-js')
  document.body.style.width = ''
  document.body.style.height = ''
}

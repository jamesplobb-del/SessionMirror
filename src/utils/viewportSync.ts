import { Capacitor } from '@capacitor/core'
import { agentDebugLog } from './agentDebugLog'

export function isIOSNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/** Tag the document so CSS can apply iOS WebKit fallbacks on every iPhone form factor. */
function markPlatformClass(): void {
  if (isIOSNative()) {
    document.documentElement.classList.add('platform-ios')
  }
}

let cachedSafeAreaInsets: { top: number; bottom: number } | null = null
let lastAppliedWidth = 0
let lastAppliedHeight = 0
let orientationTransitionActive = false

function invalidateSafeAreaCache(): void {
  cachedSafeAreaInsets = null
}

/** iOS reports safe-area via env(); cached to avoid layout thrash on every sync. */
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

  if (isIOSNative()) {
    const inner = window.innerHeight
    // outerHeight can help cold boot; ignore if it diverges (stale after backgrounding).
    if (window.outerHeight > 0 && Math.abs(window.outerHeight - inner) <= 48) {
      heightCandidates.push(window.outerHeight)
    }
  }

  return {
    width: Math.round(Math.max(...widthCandidates)),
    height: Math.round(Math.max(...heightCandidates)),
  }
}

/** Apply live viewport dimensions — skips DOM writes when size is unchanged. */
export function applyViewportCssVars(): number {
  const { width, height } = readViewportSize()
  if (width === lastAppliedWidth && height === lastAppliedHeight) {
    return height
  }

  const prevWidth = lastAppliedWidth
  const prevHeight = lastAppliedHeight

  lastAppliedWidth = width
  lastAppliedHeight = height

  // #region agent log
  agentDebugLog(
    'viewportSync.ts:applyViewportCssVars',
    'viewport dimensions applied',
    {
      prevWidth,
      prevHeight,
      width,
      height,
      orientationTransitionActive,
    },
    'H-C1',
  )
  // #endregion

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

  return height
}

/** Skip layout writes while the device is mid-rotation — one settled sync follows. */
export function isOrientationTransitionActive(): boolean {
  return orientationTransitionActive
}

/** Run before React paint so every iPhone gets correct dimensions on cold launch. */
export function bootstrapViewport(): void {
  markPlatformClass()
  applyViewportCssVars()
}

/** Clear stale inline sizes before measuring — prevents zoom/crop after app resume. */
export function applyViewportCssVarsOnResume(): number {
  document.body.style.width = ''
  document.body.style.height = ''
  lastAppliedWidth = 0
  lastAppliedHeight = 0
  void document.documentElement.offsetHeight
  return applyViewportCssVars()
}

export function refreshCameraPreviewLayout(video: HTMLVideoElement | null): void {
  if (!video || !video.srcObject) return
  if (video.paused) {
    void video.play().catch(() => {})
  }
}

const BOOT_SYNC_DELAYS_MS = [100, 300, 750]
const RESUME_SYNC_DELAYS_MS = [0, 100, 250, 500]

function syncWithRaf(sync: () => void): void {
  requestAnimationFrame(() => {
    sync()
    requestAnimationFrame(sync)
  })
}

async function setupCapacitorResumeSync(syncOnResume: () => void): Promise<(() => void) | undefined> {
  if (!Capacitor.isNativePlatform()) return undefined

  const { App } = await import('@capacitor/app')
  const sub = await App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return

    syncOnResume()
    syncWithRaf(syncOnResume)
    RESUME_SYNC_DELAYS_MS.forEach((delay) => window.setTimeout(syncOnResume, delay))
  })

  return () => {
    void sub.remove()
  }
}

export function scheduleViewportSync(onHeightChange: (height: number) => void): () => void {
  markPlatformClass()

  const sync = () => {
    if (orientationTransitionActive) return
    onHeightChange(applyViewportCssVars())
  }
  const syncOnResume = () => {
    onHeightChange(applyViewportCssVarsOnResume())
  }

  const timers = BOOT_SYNC_DELAYS_MS.map((delay) => window.setTimeout(sync, delay))

  let syncDebounceTimer: number | null = null

  const scheduleSync = (delayMs = 48) => {
    if (orientationTransitionActive) return
    if (syncDebounceTimer !== null) {
      window.clearTimeout(syncDebounceTimer)
    }
    syncDebounceTimer = window.setTimeout(() => {
      syncDebounceTimer = null
      sync()
    }, delayMs)
  }

  let orientationSyncTimer: number | null = null
  const scheduleOrientationSync = () => {
    orientationTransitionActive = true
    // #region agent log
    agentDebugLog(
      'viewportSync.ts:scheduleOrientationSync',
      'orientation transition locked',
      { viewport: readViewportSize() },
      'H-C4',
    )
    // #endregion
    invalidateSafeAreaCache()
    if (orientationSyncTimer !== null) {
      window.clearTimeout(orientationSyncTimer)
    }
    orientationSyncTimer = window.setTimeout(() => {
      orientationSyncTimer = null
      orientationTransitionActive = false
      sync()
      // #region agent log
      agentDebugLog(
        'viewportSync.ts:onOrientationChange',
        'orientation layout sync (settled)',
        {
          viewport: readViewportSize(),
          native: Capacitor.isNativePlatform(),
        },
        'H-P',
      )
      // #endregion
    }, 320)
  }

  const onOrientationChange = () => {
    scheduleOrientationSync()
  }

  const onPageShow = () => {
    if (orientationTransitionActive) return
    sync()
    syncWithRaf(sync)
  }

  const onDebouncedLayout = () => scheduleSync(48)

  const onFocus = () => {
    if (orientationTransitionActive) return
    sync()
  }

  sync()
  window.addEventListener('resize', onDebouncedLayout)
  window.addEventListener('orientationchange', onOrientationChange)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onFocus)
  window.visualViewport?.addEventListener('resize', onDebouncedLayout)
  window.visualViewport?.addEventListener('scroll', onDebouncedLayout)
  screen.orientation?.addEventListener('change', onOrientationChange)

  let capCleanup: (() => void) | undefined
  void setupCapacitorResumeSync(syncOnResume).then((cleanup) => {
    capCleanup = cleanup
  })

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer))
    if (orientationSyncTimer !== null) {
      window.clearTimeout(orientationSyncTimer)
    }
    if (syncDebounceTimer !== null) {
      window.clearTimeout(syncDebounceTimer)
    }
    window.removeEventListener('resize', onDebouncedLayout)
    window.removeEventListener('orientationchange', onOrientationChange)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('focus', onFocus)
    window.visualViewport?.removeEventListener('resize', onDebouncedLayout)
    window.visualViewport?.removeEventListener('scroll', onDebouncedLayout)
    screen.orientation?.removeEventListener('change', onOrientationChange)
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
  lastAppliedWidth = 0
  lastAppliedHeight = 0
  cachedSafeAreaInsets = null
}

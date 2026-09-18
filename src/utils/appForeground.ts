import { Capacitor } from '@capacitor/core'

export const APP_BACKGROUND_SUSPEND_EVENT = 'sessionmirror:app-background-suspend'
export const APP_FOREGROUND_RECOVERY_EVENT = 'sessionmirror:app-foreground-recovery'
export const APP_INTERACTIVE_MEDIA_RECOVERY_EVENT = 'sessionmirror:interactive-media-recovery'

let appInForeground =
  typeof document === 'undefined' ? true : document.visibilityState === 'visible'

let lifecycleRegistered = false
const listeners = new Set<(foreground: boolean) => void>()
let recoverySequence = 0
let recoveryTimer: number | null = null
/**
 * visibilitychange, pageshow, focus, and native appStateChange commonly all
 * fire within milliseconds of the SAME real resume (well-documented iOS
 * WKWebView overlap) — without this guard each one independently re-dispatched
 * APP_FOREGROUND_RECOVERY_EVENT, cascading into every listener's resume work
 * (AudioContext.resume(), camera health checks, metronome recovery, ...) 2-4x
 * over per actual backgrounding cycle. Reset on background so a genuinely
 * separate resume is never suppressed.
 */
let lastForegroundDispatchAt = 0
const FOREGROUND_DISPATCH_DEDUPE_MS = 250

function setAppInForeground(foreground: boolean) {
  if (appInForeground === foreground) return
  appInForeground = foreground
  for (const listener of listeners) {
    listener(foreground)
  }
}

function dispatchLifecycleEvent(eventName: string, reason: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(eventName, {
      detail: { reason, sequence: recoverySequence },
    }),
  )
}

function dispatchBackground(reason: string): void {
  recoverySequence += 1
  lastForegroundDispatchAt = 0
  if (recoveryTimer !== null) {
    window.clearTimeout(recoveryTimer)
    recoveryTimer = null
  }
  dispatchLifecycleEvent(APP_BACKGROUND_SUSPEND_EVENT, reason)
}

function dispatchForeground(reason: string): void {
  recoverySequence += 1

  const now = Date.now()
  if (now - lastForegroundDispatchAt >= FOREGROUND_DISPATCH_DEDUPE_MS) {
    lastForegroundDispatchAt = now
    dispatchLifecycleEvent(APP_FOREGROUND_RECOVERY_EVENT, reason)
    dispatchLifecycleEvent(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, reason)
  }

  if (recoveryTimer !== null) {
    window.clearTimeout(recoveryTimer)
  }

  const sequence = recoverySequence
  recoveryTimer = window.setTimeout(() => {
    if (sequence !== recoverySequence) return
    recoveryTimer = null
    dispatchLifecycleEvent(APP_FOREGROUND_RECOVERY_EVENT, `${reason}:settled`)
    dispatchLifecycleEvent(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, `${reason}:settled`)
  }, 450)
}

/** Revalidate idle media engines from a real user gesture without changing their on/off state. */
export function requestInteractiveMediaRecovery(reason: string): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  recoverySequence += 1
  dispatchLifecycleEvent(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, reason)
}

function markForeground(reason: string): void {
  const wasForeground = appInForeground
  setAppInForeground(true)
  // focus and pageshow also fire while the app never left — after the
  // keyboard, a picker, or a system overlay. Treating those as a resume re-ran
  // every recovery (microphone and camera refresh, playback route release,
  // context resume) under whatever was sounding. Only a real return does now.
  if (wasForeground && (reason === 'window-focus' || reason === 'pageshow')) return
  dispatchForeground(reason)
}

function markBackground(reason: string): void {
  setAppInForeground(false)
  dispatchBackground(reason)
}

/**
 * iOS reports "inactive" for Control Center, a pulled-down notification, a
 * system prompt or the volume overlay while the app never leaves the screen.
 * Each of those ran a full background suspend and then a full foreground
 * recovery: microphone and camera torn down and rebuilt, playback routes
 * released, the audio session reconfigured twice under a running metronome —
 * which is how adjusting the volume froze the click and jumped the level. A
 * real background still hides the page and is marked at once; "inactive" on
 * its own now has to outlast this grace.
 */
const INACTIVE_GRACE_MS = 1500
let inactiveTimer: number | null = null
let inactiveSince = 0

function clearInactiveGrace(): void {
  if (inactiveTimer === null) return
  window.clearTimeout(inactiveTimer)
  inactiveTimer = null
}

export function isAppInForeground(): boolean {
  return appInForeground
}

export function subscribeAppForeground(listener: (foreground: boolean) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function registerAppForegroundLifecycle(): void {
  if (lifecycleRegistered || typeof document === 'undefined') return
  lifecycleRegistered = true

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      markForeground('visibility-visible')
      return
    }
    clearInactiveGrace()
    markBackground('visibility-hidden')
  }

  const onPageShow = () => {
    if (document.visibilityState === 'visible') {
      markForeground('pageshow')
    }
  }

  const onFocus = () => {
    if (document.visibilityState === 'visible') {
      markForeground('window-focus')
    }
  }

  const onPageHide = () => {
    clearInactiveGrace()
    markBackground('pagehide')
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onFocus)
  window.addEventListener('pagehide', onPageHide)

  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          if (inactiveTimer !== null) {
            // A timer still pending after more than twice its delay means
            // WebKit was suspended and it never got to run: a real absence.
            const overlayOnly = Date.now() - inactiveSince < INACTIVE_GRACE_MS * 2
            clearInactiveGrace()
            if (overlayOnly && appInForeground) return
            if (appInForeground) markBackground('capacitor-inactive')
          }
          markForeground('capacitor-active')
          return
        }
        if (!appInForeground || inactiveTimer !== null) return
        inactiveSince = Date.now()
        inactiveTimer = window.setTimeout(() => {
          inactiveTimer = null
          markBackground('capacitor-inactive')
        }, INACTIVE_GRACE_MS)
      })
    })
    return
  }

  setAppInForeground(document.visibilityState === 'visible')
}

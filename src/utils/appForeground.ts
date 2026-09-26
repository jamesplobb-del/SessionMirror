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
    // WKWebView visibility can change under Control Center without UIKit
    // entering the background. Native pause is the authoritative event.
    if (Capacitor.isNativePlatform()) return
    if (document.visibilityState === 'visible') {
      markForeground('visibility-visible')
      return
    }
    markBackground('visibility-hidden')
  }

  const onPageShow = () => {
    if (Capacitor.isNativePlatform()) return
    if (document.visibilityState === 'visible') {
      markForeground('pageshow')
    }
  }

  const onFocus = () => {
    if (Capacitor.isNativePlatform()) return
    if (document.visibilityState === 'visible') {
      markForeground('window-focus')
    }
  }

  const onPageHide = () => {
    if (Capacitor.isNativePlatform()) return
    markBackground('pagehide')
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onFocus)
  window.addEventListener('pagehide', onPageHide)

  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app').then(({ App }) => {
      // iOS appStateChange(false) is willResignActive, also sent for Control
      // Center and volume controls. pause is the actual background transition.
      void App.addListener('pause', () => markBackground('capacitor-pause'))
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && !appInForeground) markForeground('capacitor-active')
      })
    })
    return
  }

  setAppInForeground(document.visibilityState === 'visible')
}

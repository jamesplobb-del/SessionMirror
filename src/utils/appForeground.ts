import { Capacitor } from '@capacitor/core'

export const APP_BACKGROUND_SUSPEND_EVENT = 'sessionmirror:app-background-suspend'
export const APP_FOREGROUND_RECOVERY_EVENT = 'sessionmirror:app-foreground-recovery'

let appInForeground =
  typeof document === 'undefined' ? true : document.visibilityState === 'visible'

let lifecycleRegistered = false
const listeners = new Set<(foreground: boolean) => void>()
let recoverySequence = 0
let recoveryTimer: number | null = null

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
  if (recoveryTimer !== null) {
    window.clearTimeout(recoveryTimer)
    recoveryTimer = null
  }
  dispatchLifecycleEvent(APP_BACKGROUND_SUSPEND_EVENT, reason)
}

function dispatchForeground(reason: string): void {
  recoverySequence += 1
  dispatchLifecycleEvent(APP_FOREGROUND_RECOVERY_EVENT, reason)

  if (recoveryTimer !== null) {
    window.clearTimeout(recoveryTimer)
  }

  const sequence = recoverySequence
  recoveryTimer = window.setTimeout(() => {
    if (sequence !== recoverySequence) return
    recoveryTimer = null
    dispatchLifecycleEvent(APP_FOREGROUND_RECOVERY_EVENT, `${reason}:settled`)
  }, 450)
}

function markForeground(reason: string): void {
  setAppInForeground(true)
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
    if (document.visibilityState === 'visible') {
      markForeground('visibility-visible')
      return
    }
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

  const onPageHide = () => markBackground('pagehide')

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onFocus)
  window.addEventListener('pagehide', onPageHide)

  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          markForeground('capacitor-active')
          return
        }
        markBackground('capacitor-inactive')
      })
    })
    return
  }

  setAppInForeground(document.visibilityState === 'visible')
}

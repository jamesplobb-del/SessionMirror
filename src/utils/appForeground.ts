import { Capacitor } from '@capacitor/core'

let appInForeground =
  typeof document === 'undefined' ? true : document.visibilityState === 'visible'

let lifecycleRegistered = false
const listeners = new Set<(foreground: boolean) => void>()

function setAppInForeground(foreground: boolean) {
  if (appInForeground === foreground) return
  appInForeground = foreground
  for (const listener of listeners) {
    listener(foreground)
  }
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

  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        setAppInForeground(isActive)
      })
    })
    return
  }

  const onVisibilityChange = () => {
    setAppInForeground(document.visibilityState === 'visible')
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  setAppInForeground(document.visibilityState === 'visible')
}

import { Capacitor } from '@capacitor/core'

let wakeDesired = false
let appInForeground = true
let wakeHeld = false
let lifecycleRegistered = false

async function syncKeepAwake(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  const shouldHold = wakeDesired && appInForeground

  try {
    const { KeepAwake } = await import('@capacitor-community/keep-awake')

    if (shouldHold && !wakeHeld) {
      await KeepAwake.keepAwake()
      wakeHeld = true
      return
    }

    if (!shouldHold && wakeHeld) {
      await KeepAwake.allowSleep()
      wakeHeld = false
    }
  } catch {
    // Plugin unavailable until `npx cap sync ios` on device builds.
  }
}

/** Request screen stay-on while recording, reviewing, or playing back. */
export function setKeepAwakeDesired(desired: boolean): void {
  wakeDesired = desired
  void syncKeepAwake()
}

export function registerKeepAwakeLifecycle(): void {
  if (!Capacitor.isNativePlatform() || lifecycleRegistered) return
  lifecycleRegistered = true

  void import('@capacitor/app').then(({ App }) => {
    void App.addListener('appStateChange', ({ isActive }) => {
      appInForeground = isActive
      if (!isActive && wakeHeld) {
        void import('@capacitor-community/keep-awake')
          .then(({ KeepAwake }) => KeepAwake.allowSleep())
          .then(() => {
            wakeHeld = false
          })
          .catch(() => {
            wakeHeld = false
          })
        return
      }

      void syncKeepAwake()
    })
  })
}

import { Capacitor } from '@capacitor/core'

export async function lockPortraitOrientation(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation')
    await ScreenOrientation.lock({ orientation: 'portrait' })
  } catch {
    /* orientation lock unavailable */
  }
}

export async function unlockAppOrientation(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation')
    await ScreenOrientation.unlock()
  } catch {
    /* orientation unlock unavailable */
  }
}

/** Portrait-locked shell everywhere — same as main camera (tilt for landscape takes, UI stays upright). */
export async function syncAppOrientationLock(_splitViewOpen?: boolean): Promise<void> {
  await lockPortraitOrientation()
}

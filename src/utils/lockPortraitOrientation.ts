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

/** Portrait HUD by default; expand/split view allows device rotation for landscape takes. */
export async function syncAppOrientationLock(splitViewOpen: boolean): Promise<void> {
  if (splitViewOpen) {
    await unlockAppOrientation()
    return
  }
  await lockPortraitOrientation()
}

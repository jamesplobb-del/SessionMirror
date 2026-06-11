import { Capacitor } from '@capacitor/core'
export async function lockPortraitOrientation(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation')
    await ScreenOrientation.lock({ orientation: 'portrait' })
  } catch (err) {
  }
}

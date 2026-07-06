import { Capacitor } from '@capacitor/core'

function shouldUseTabletOrientation(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const minViewport = Math.min(window.innerWidth || 0, window.innerHeight || 0)
  const maxScreen = Math.max(window.screen?.width || 0, window.screen?.height || 0)
  const isiPad =
    /iPad/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && maxScreen >= 1000)

  return isiPad || (coarsePointer && minViewport >= 744)
}

export async function lockPortraitOrientation(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation')
    if (shouldUseTabletOrientation()) {
      await ScreenOrientation.unlock()
      return
    }
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

/** Phones stay portrait-locked; tablets use native rotation so iPad landscape layouts behave as one piece. */
export async function syncAppOrientationLock(_splitViewOpen?: boolean): Promise<void> {
  await lockPortraitOrientation()
}

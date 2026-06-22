import { Capacitor } from '@capacitor/core'

/** Light tap — uses Capacitor Haptics on native, vibrate API on web. */
export async function triggerSelectionHaptic(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
      await Haptics.impact({ style: ImpactStyle.Light })
    } catch {
      /* haptics unavailable */
    }
    return
  }

  navigator.vibrate?.(12)
}

/** Medium pulse when a long-press action fires (e.g. quick settings). */
export async function triggerLongPressHaptic(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
      await Haptics.impact({ style: ImpactStyle.Medium })
    } catch {
      /* haptics unavailable */
    }
    return
  }

  navigator.vibrate?.(22)
}

/** Slightly stronger pulse when drag begins. */
export async function triggerDragStartHaptic(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
      await Haptics.impact({ style: ImpactStyle.Medium })
    } catch {
      /* haptics unavailable */
    }
    return
  }

  navigator.vibrate?.(18)
}

import { Capacitor } from '@capacitor/core'

function runImpact(style: 'light' | 'medium'): void {
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) =>
      Haptics.impact({
        style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light,
      }),
    )
    return
  }

  navigator.vibrate?.(style === 'medium' ? 22 : 12)
}

/** Light tap — toggles, play, tabs, opening menus. */
export function triggerLightHaptic(enabled = true): void {
  if (!enabled) return
  runImpact('light')
}

/** Medium pulse — record, delete, save, heavy commits. */
export function triggerMediumHaptic(enabled = true): void {
  if (!enabled) return
  runImpact('medium')
}

/** @deprecated Use triggerLightHaptic */
export async function triggerSelectionHaptic(): Promise<void> {
  triggerLightHaptic()
}

/** Medium pulse when a long-press action fires (e.g. quick settings). */
export async function triggerLongPressHaptic(): Promise<void> {
  triggerMediumHaptic()
}

/** Slightly stronger pulse when drag begins. */
export async function triggerDragStartHaptic(): Promise<void> {
  triggerMediumHaptic()
}

import { Capacitor } from '@capacitor/core'

function runImpact(style: 'light' | 'medium' | 'heavy'): void {
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) =>
      Haptics.impact({
        style:
          style === 'heavy'
            ? ImpactStyle.Heavy
            : style === 'medium'
              ? ImpactStyle.Medium
              : ImpactStyle.Light,
      }),
    )
    return
  }

  navigator.vibrate?.(style === 'heavy' ? 32 : style === 'medium' ? 22 : 12)
}

function runNotification(type: 'success' | 'warning' | 'error'): void {
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/haptics').then(({ Haptics, NotificationType }) =>
      Haptics.notification({
        type:
          type === 'success'
            ? NotificationType.Success
            : type === 'warning'
              ? NotificationType.Warning
              : NotificationType.Error,
      }),
    )
    return
  }

  const pattern =
    type === 'success' ? [10, 48, 12] : type === 'warning' ? [14, 36, 14] : [22, 52, 22]
  navigator.vibrate?.(pattern)
}

/** Light tap — toggles, play, tabs, opening menus. */
export function triggerLightHaptic(enabled = true): void {
  if (!enabled) return
  runImpact('light')
}

/** Medium pulse — record, save, heavy commits. */
export function triggerMediumHaptic(enabled = true): void {
  if (!enabled) return
  runImpact('medium')
}

/** Heavy pulse — recording stop or similarly weighty commits. */
export function triggerHeavyHaptic(enabled = true): void {
  if (!enabled) return
  runImpact('heavy')
}

/** Success — save, export, complete. */
export function triggerSuccessHaptic(enabled = true): void {
  if (!enabled) return
  runNotification('success')
}

export function triggerRecordStartHaptic(enabled = true): void {
  triggerMediumHaptic(enabled)
}

export function triggerRecordStopHaptic(enabled = true): void {
  triggerHeavyHaptic(enabled)
}

export function triggerBestTakeHaptic(enabled = true): void {
  triggerSuccessHaptic(enabled)
}

export function triggerMetronomeTapHaptic(enabled = true): void {
  triggerLightHaptic(enabled)
}

export function triggerMetronomeToggleHaptic(playing: boolean, enabled = true): void {
  if (playing) {
    triggerMediumHaptic(enabled)
    return
  }
  triggerLightHaptic(enabled)
}

/** Warning — destructive confirm. */
export function triggerWarningHaptic(enabled = true): void {
  if (!enabled) return
  runNotification('warning')
}

/** Error — failure, blocked action. */
export function triggerErrorHaptic(enabled = true): void {
  if (!enabled) return
  runNotification('error')
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

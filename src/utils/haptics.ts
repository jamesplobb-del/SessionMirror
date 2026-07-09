import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'

const isNative = Capacitor.isNativePlatform()
const isIOS = isNative && Capacitor.getPlatform() === 'ios'
const HAPTIC_REPRIME_DELAY_MS = 700
let hapticReprimeTimer: number | null = null

/**
 * Cache the Capacitor haptics module once (Android / non-iOS native). The old
 * per-tap dynamic import often resolved after the gesture, so haptics arrived
 * late or were dropped. iOS uses the native pre-warmed Taptic path instead.
 */
type CapacitorHapticsModule = typeof import('@capacitor/haptics')
let capacitorHapticsPromise: Promise<CapacitorHapticsModule> | null = null
function loadCapacitorHaptics(): Promise<CapacitorHapticsModule> {
  if (!capacitorHapticsPromise) {
    capacitorHapticsPromise = import('@capacitor/haptics')
  }
  return capacitorHapticsPromise
}

if (isNative && !isIOS) {
  // Warm the module immediately so the first Android tap isn't a cold import.
  void loadCapacitorHaptics()
}

/** Keep the native Taptic Engine primed (call after playback / long idle). */
export function warmHaptics(): void {
  if (isIOS) {
    void BestTakeAudioPlugin.prepareHaptics().catch(() => {})
  }
}

function scheduleHapticReprime(): void {
  if (!isIOS) return
  if (hapticReprimeTimer !== null) {
    window.clearTimeout(hapticReprimeTimer)
  }
  hapticReprimeTimer = window.setTimeout(() => {
    hapticReprimeTimer = null
    warmHaptics()
  }, HAPTIC_REPRIME_DELAY_MS)
}

if (isIOS) {
  warmHaptics()
}

function runImpact(style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid'): void {
  if (isIOS) {
    void BestTakeAudioPlugin.hapticImpact({ style }).catch(() => {}).finally(scheduleHapticReprime)
    return
  }

  if (isNative) {
    void loadCapacitorHaptics().then(({ Haptics, ImpactStyle }) =>
      Haptics.impact({
        style:
          style === 'heavy'
            ? ImpactStyle.Heavy
            : style === 'medium' || style === 'rigid'
              ? ImpactStyle.Medium
              : ImpactStyle.Light,
      }),
    )
    return
  }

  navigator.vibrate?.(style === 'heavy' ? 32 : style === 'medium' ? 22 : 12)
}

function runNotification(type: 'success' | 'warning' | 'error'): void {
  if (isIOS) {
    void BestTakeAudioPlugin.hapticNotification({ type }).catch(() => {}).finally(scheduleHapticReprime)
    return
  }

  if (isNative) {
    void loadCapacitorHaptics().then(({ Haptics, NotificationType }) =>
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

/** Crisp iOS mode-switch tick — used for camera/audio carousel changes. */
export function triggerModeSwitchHaptic(enabled = true): void {
  if (!enabled) return
  runImpact('rigid')
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

/** Deliberate pulse when a long-press action fires (e.g. quick settings reveal). */
export async function triggerLongPressHaptic(): Promise<void> {
  triggerHeavyHaptic()
}

/** Slightly stronger pulse when drag begins. */
export async function triggerDragStartHaptic(): Promise<void> {
  triggerMediumHaptic()
}

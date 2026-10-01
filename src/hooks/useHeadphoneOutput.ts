import { useSyncExternalStore } from 'react'
import { isConfirmedHeadphoneOutputActive, isHeadphoneOutputActive, needsBluetoothHeadphoneConfirmation, subscribeConfirmedHeadphoneOutput, subscribeHeadphoneOutput } from '../utils/headphoneOutput'

/**
 * Live headphone-output state (wired or Bluetooth), for UI that must not send
 * audio to the speaker while the microphone is open. Read-only: it never
 * applies a route, it only reports the one the session already has.
 */
export function useHeadphoneOutput(): boolean {
  return useSyncExternalStore(subscribeHeadphoneOutput, isHeadphoneOutputActive, () => false)
}

/** Private output confirmed from the native route; unknown and AirPlay are excluded. */
export function useConfirmedHeadphoneOutput(): boolean {
  return useSyncExternalStore(subscribeConfirmedHeadphoneOutput, isConfirmedHeadphoneOutputActive, () => false)
}

/** Bluetooth outputs can be speakers; require the player to confirm headphones. */
export function useBluetoothHeadphoneConfirmation(): boolean {
  return useSyncExternalStore(subscribeConfirmedHeadphoneOutput, needsBluetoothHeadphoneConfirmation, () => false)
}

import { useSyncExternalStore } from 'react'
import { isHeadphoneOutputActive, subscribeHeadphoneOutput } from '../utils/headphoneOutput'

/**
 * Live headphone-output state (wired or Bluetooth), for UI that must not send
 * audio to the speaker while the microphone is open. Read-only: it never
 * applies a route, it only reports the one the session already has.
 */
export function useHeadphoneOutput(): boolean {
  return useSyncExternalStore(subscribeHeadphoneOutput, isHeadphoneOutputActive, () => false)
}

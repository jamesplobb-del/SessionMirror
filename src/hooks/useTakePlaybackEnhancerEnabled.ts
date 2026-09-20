import { useSyncExternalStore } from 'react'
import { isTakePlaybackEnhancerEnabled, subscribeTakePlaybackEnhancer, takePlaybackEnhancerRevision } from '../utils/takePlaybackSpeaker'

/** Memoized take cards must follow enhancer changes made outside their props. */
export function useTakePlaybackEnhancerEnabled(): boolean {
  return useSyncExternalStore(subscribeTakePlaybackEnhancer, isTakePlaybackEnhancerEnabled, () => false)
}

export function useTakePlaybackEnhancerRevision(): number {
  return useSyncExternalStore(subscribeTakePlaybackEnhancer, takePlaybackEnhancerRevision, () => 0)
}

import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'

export type PlaybackOutputProfile = 'speaker' | 'headphones'

let cachedProfile: PlaybackOutputProfile = 'speaker'
const listeners = new Set<(profile: PlaybackOutputProfile) => void>()

export function getPlaybackOutputProfile(): PlaybackOutputProfile {
  return cachedProfile
}

export function subscribePlaybackOutputProfile(
  listener: (profile: PlaybackOutputProfile) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifyProfileChange(profile: PlaybackOutputProfile): void {
  for (const listener of listeners) {
    listener(profile)
  }
}

/** Read iOS AVAudioSession route and cache speaker vs headphones profile. */
export async function refreshPlaybackOutputProfile(): Promise<PlaybackOutputProfile> {
  if (!Capacitor.isNativePlatform()) {
    cachedProfile = 'speaker'
    return cachedProfile
  }

  try {
    const { usesHeadphones } = await BestTakeAudioPlugin.getPlaybackOutputProfile()
    const next: PlaybackOutputProfile = usesHeadphones ? 'headphones' : 'speaker'
    if (next !== cachedProfile) {
      cachedProfile = next
      notifyProfileChange(cachedProfile)
    }
  } catch (error) {
    console.warn('Failed to read playback output profile:', error)
  }

  return cachedProfile
}

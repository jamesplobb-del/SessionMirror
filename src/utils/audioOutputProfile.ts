import { Capacitor } from '@capacitor/core'
import type { AudioRouteSnapshot } from './audioSessionRoute'

export type PlaybackOutputProfile = 'speaker' | 'headphones'

const PROFILE_REFRESH_TIMEOUT_MS = 500

const HEADPHONE_OUTPUT_PORTS = new Set([
  'BluetoothA2DP',
  'BluetoothHFP',
  'BluetoothLE',
  'Headphones',
  'HeadsetMic',
  'AirPlay',
])

let cachedProfile: PlaybackOutputProfile = 'speaker'
let forceHeadphoneGainDebug = false
let refreshInFlight: Promise<PlaybackOutputProfile> | null = null
let routeListenerInstalled = false
const listeners = new Set<(profile: PlaybackOutputProfile) => void>()

/** Debug-only: force 6× headphone gain without a confirmed output route. */
export function setForceHeadphoneGainDebug(enabled: boolean): void {
  if (forceHeadphoneGainDebug === enabled) return
  forceHeadphoneGainDebug = enabled
  notifyProfileChange(getPlaybackOutputProfile())
}

export function isForceHeadphoneGainDebugEnabled(): boolean {
  return forceHeadphoneGainDebug
}

export function isConfirmedHeadphoneOutput(snapshot: AudioRouteSnapshot): boolean {
  if (snapshot.usesHeadphones) return true
  if (snapshot.usesA2DPOutput || snapshot.usesBluetoothOutput) return true
  const outputPort = snapshot.outputPort ?? ''
  return HEADPHONE_OUTPUT_PORTS.has(outputPort)
}

export function getPlaybackOutputProfile(): PlaybackOutputProfile {
  if (forceHeadphoneGainDebug) return 'headphones'
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

function startProfileRefresh(): Promise<PlaybackOutputProfile> {
  if (!refreshInFlight) {
    refreshInFlight = refreshPlaybackOutputProfile().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/** Read iOS AVAudioSession route and cache speaker vs headphones profile. */
export async function refreshPlaybackOutputProfile(): Promise<PlaybackOutputProfile> {
  if (!Capacitor.isNativePlatform()) {
    cachedProfile = 'speaker'
    return getPlaybackOutputProfile()
  }

  try {
    const { default: BestTakeAudioPlugin } = await import('./audioSessionRoute')
    const snapshot = await BestTakeAudioPlugin.getPlaybackOutputProfile()
    const previous = cachedProfile
    const next: PlaybackOutputProfile = isConfirmedHeadphoneOutput(snapshot)
      ? 'headphones'
      : 'speaker'
    console.info(
      '[AudioRoute] refresh profile',
      `input=${snapshot.inputPort}`,
      `output=${snapshot.outputPort}`,
      `splitRoute=${snapshot.splitRouteAchieved}`,
      `usesHeadphones=${snapshot.usesHeadphones}`,
      `cachedBefore=${previous}`,
    )
    if (next !== cachedProfile) {
      cachedProfile = next
      notifyProfileChange(getPlaybackOutputProfile())
      console.info('[AudioRoute] profile cache updated', `${previous} → ${cachedProfile}`)
    } else {
      console.info('[AudioRoute] profile cache unchanged', cachedProfile)
    }
  } catch (error) {
    console.warn('Failed to read playback output profile:', error)
  }

  return getPlaybackOutputProfile()
}

/**
 * Best-effort native route read before gain is applied.
 * Times out quickly and falls back to the existing cached profile.
 */
export async function ensureFreshPlaybackOutputProfile(
  timeoutMs = PROFILE_REFRESH_TIMEOUT_MS,
): Promise<PlaybackOutputProfile> {
  if (!Capacitor.isNativePlatform()) {
    return getPlaybackOutputProfile()
  }

  const refresh = startProfileRefresh()

  try {
    return await Promise.race([
      refresh,
      new Promise<PlaybackOutputProfile>((resolve) => {
        window.setTimeout(() => resolve(getPlaybackOutputProfile()), timeoutMs)
      }),
    ])
  } catch {
    return getPlaybackOutputProfile()
  }
}

/** Refresh cached speaker/headphones profile when iOS audio route changes. */
export function installPlaybackOutputProfileRouteListener(): void {
  if (routeListenerInstalled || !Capacitor.isNativePlatform()) return
  routeListenerInstalled = true

  void import('./audioSessionRoute').then(({ default: BestTakeAudioPlugin }) => {
    void BestTakeAudioPlugin.addListener('audioRouteChanged', () => {
      console.info('[AudioRoute] native route change event')
      void refreshPlaybackOutputProfile()
    })
  })
}

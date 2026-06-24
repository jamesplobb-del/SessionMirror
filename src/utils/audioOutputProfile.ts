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

/** User-enabled Bluetooth/headphone playback mode — only source for headphone gain tier. */
let explicitBluetoothHeadphonePlaybackMode = false

/** Native route cache — diagnostics/future only; never affects gain when explicit mode is OFF. */
let cachedProfile: PlaybackOutputProfile = 'speaker'
let refreshInFlight: Promise<PlaybackOutputProfile> | null = null
let routeListenerInstalled = false
const listeners = new Set<(profile: PlaybackOutputProfile) => void>()

/**
 * Set only from the user's "Bluetooth/Headphone Playback Mode" setting.
 * Never called on native route failure or app launch heuristics.
 */
export function setBluetoothHeadphonePlaybackMode(enabled: boolean): void {
  if (explicitBluetoothHeadphonePlaybackMode === enabled) return
  explicitBluetoothHeadphonePlaybackMode = enabled
  notifyProfileChange(getPlaybackOutputProfile())
}

export function isBluetoothHeadphonePlaybackModeEnabled(): boolean {
  return explicitBluetoothHeadphonePlaybackMode
}

export function isConfirmedHeadphoneOutput(snapshot: AudioRouteSnapshot): boolean {
  if (snapshot.usesHeadphones) return true
  if (snapshot.usesA2DPOutput || snapshot.usesBluetoothOutput) return true
  const outputPort = snapshot.outputPort ?? ''
  return HEADPHONE_OUTPUT_PORTS.has(outputPort)
}

/** Gain/routing profile — headphones only when user explicitly enabled Bluetooth/headphone mode. */
export function getPlaybackOutputProfile(): PlaybackOutputProfile {
  return explicitBluetoothHeadphonePlaybackMode ? 'headphones' : 'speaker'
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

/** Read iOS AVAudioSession route — updates internal cache only; does not change gain profile. */
export async function refreshPlaybackOutputProfile(): Promise<PlaybackOutputProfile> {
  if (!Capacitor.isNativePlatform()) {
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
      '[AudioRoute] refresh profile (cache only)',
      `input=${snapshot.inputPort}`,
      `output=${snapshot.outputPort}`,
      `splitRoute=${snapshot.splitRouteAchieved}`,
      `usesHeadphones=${snapshot.usesHeadphones}`,
      `cachedBefore=${previous}`,
      `effectiveProfile=${getPlaybackOutputProfile()}`,
    )
    if (next !== cachedProfile) {
      cachedProfile = next
      console.info('[AudioRoute] native route cache updated', `${previous} → ${cachedProfile}`)
    } else {
      console.info('[AudioRoute] native route cache unchanged', cachedProfile)
    }
  } catch (error) {
    console.warn('Failed to read playback output profile:', error)
  }

  return getPlaybackOutputProfile()
}

/**
 * Best-effort native route read before gain is applied.
 * Does not change effective profile — only refreshes native cache when available.
 */
export async function ensureFreshPlaybackOutputProfile(
  timeoutMs = PROFILE_REFRESH_TIMEOUT_MS,
): Promise<PlaybackOutputProfile> {
  if (!Capacitor.isNativePlatform()) {
    return getPlaybackOutputProfile()
  }

  const refresh = startProfileRefresh()

  try {
    await Promise.race([
      refresh,
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs)
      }),
    ])
  } catch {
    /* keep effective profile unchanged */
  }

  return getPlaybackOutputProfile()
}

/** Refresh native route cache when iOS audio route changes (does not auto-enable headphone mode). */
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

/**
 * Passive headphone-output detection. Read-only: it observes the AVAudioSession
 * route to know whether audio is currently going to headphones (wired or
 * Bluetooth). It NEVER applies a route, reconfigures the session, or touches the
 * camera — it only flips a cached boolean so the playback bus can pick a clean,
 * non-clipping gain for headphones while leaving the speaker path untouched.
 */
import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin, { type AudioRouteSnapshot } from './audioSessionRoute'

const HEADPHONE_OUTPUT_PORTS = new Set([
  'Headphones',
  'BluetoothA2DPOutput',
  'BluetoothA2DP',
  'BluetoothLE',
  'BluetoothHFP',
  'AirPlay',
])

let headphonesConnected = false
let detectionInstalled = false
const listeners = new Set<(connected: boolean) => void>()

function snapshotHasHeadphones(snapshot: AudioRouteSnapshot): boolean {
  if (snapshot.usesHeadphones) return true
  if (snapshot.usesA2DPOutput) return true
  if (snapshot.usesBluetoothOutput) return true
  const output = snapshot.outputPort ?? snapshot.portType
  return output ? HEADPHONE_OUTPUT_PORTS.has(output) : false
}

function setHeadphonesConnected(next: boolean): void {
  if (next === headphonesConnected) return
  headphonesConnected = next
  for (const listener of listeners) listener(next)
}

export function isHeadphoneOutputActive(): boolean {
  return headphonesConnected
}

export function subscribeHeadphoneOutput(
  listener: (connected: boolean) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function initHeadphoneOutputDetection(): void {
  if (detectionInstalled || !Capacitor.isNativePlatform()) return
  detectionInstalled = true

  void BestTakeAudioPlugin.getPlaybackOutputProfile()
    .then((snapshot) => setHeadphonesConnected(snapshotHasHeadphones(snapshot)))
    .catch(() => {
      /* read-only probe — ignore if unavailable */
    })

  void BestTakeAudioPlugin.addListener('audioRouteChanged', (snapshot) => {
    setHeadphonesConnected(snapshotHasHeadphones(snapshot))
  })
}

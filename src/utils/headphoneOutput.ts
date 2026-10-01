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
const BLUETOOTH_HEADPHONE_PORTS = new Set([
  'BluetoothA2DPOutput',
  'BluetoothA2DP',
  'BluetoothLE',
  'BluetoothHFP',
])

// A Bluetooth route may be a speaker. Require the musician to identify that
// device as headphones; wired headphones are identified by the native port.
export function hasConfirmedHeadphoneOutput(snapshot: AudioRouteSnapshot, bluetoothConfirmed = false): boolean {
  const output = snapshot.outputPort ?? snapshot.portType
  return output === 'Headphones' || (bluetoothConfirmed && output != null && BLUETOOTH_HEADPHONE_PORTS.has(output))
}

let latestSnapshot: AudioRouteSnapshot | null = null
let bluetoothAcknowledged = false
let bluetoothConfirmationNeeded = false
let confirmedHeadphonesConnected = false
const confirmedListeners = new Set<(connected: boolean) => void>()

export function isConfirmedHeadphoneOutputActive(): boolean {
  return confirmedHeadphonesConnected
}

export function needsBluetoothHeadphoneConfirmation(): boolean {
  return bluetoothConfirmationNeeded
}

function refreshConfirmedSnapshot(): void {
  const output = latestSnapshot?.outputPort ?? latestSnapshot?.portType
  const needsConfirmation = output != null && BLUETOOTH_HEADPHONE_PORTS.has(output) && !bluetoothAcknowledged
  const confirmed = latestSnapshot != null && hasConfirmedHeadphoneOutput(latestSnapshot, bluetoothAcknowledged)
  if (confirmed === confirmedHeadphonesConnected && needsConfirmation === bluetoothConfirmationNeeded) return
  confirmedHeadphonesConnected = confirmed
  bluetoothConfirmationNeeded = needsConfirmation
  for (const listener of confirmedListeners) listener(confirmed)
}

export function confirmBluetoothHeadphones(): void {
  if (!bluetoothConfirmationNeeded) return
  bluetoothAcknowledged = true
  refreshConfirmedSnapshot()
}

export function subscribeConfirmedHeadphoneOutput(listener: (connected: boolean) => void): () => void {
  confirmedListeners.add(listener)
  return () => confirmedListeners.delete(listener)
}

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

function updateHeadphoneSnapshot(snapshot: AudioRouteSnapshot, routeEvent = false): void {
  const previousPort = latestSnapshot?.outputPort ?? latestSnapshot?.portType
  const outputPort = snapshot.outputPort ?? snapshot.portType
  const previousUID = latestSnapshot?.outputUID || null
  const outputUID = snapshot.outputUID || null
  if (previousPort !== outputPort || previousUID !== outputUID || (routeEvent && (!previousUID || !outputUID))) {
    bluetoothAcknowledged = false
  }
  latestSnapshot = { ...snapshot }
  refreshConfirmedSnapshot()
  // The broad playback gain hint remains independent of game confirmation.
  const next = snapshotHasHeadphones(snapshot)
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

  // Subscribe before the initial probe so a route change cannot be replaced
  // by an older snapshot that resolves later.
  let routeEventObserved = false
  void BestTakeAudioPlugin.addListener('audioRouteChanged', (snapshot) => {
    routeEventObserved = true
    updateHeadphoneSnapshot(snapshot, true)
  })
    .then(() => BestTakeAudioPlugin.getPlaybackOutputProfile())
    .then((snapshot) => {
      if (!routeEventObserved) updateHeadphoneSnapshot(snapshot)
    })
    .catch(() => {
      /* read-only probe — ignore if unavailable */
    })
}

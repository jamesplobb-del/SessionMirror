import type { PluginListenerHandle } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isNativeCameraTestAvailable } from './nativeCameraTest'
import {
  isNativeCaptureSessionActive,
  setNativeAudioCaptureActive,
} from './cameraSessionState'
import type { MicInputPreference } from './appSettings'

/**
 * Native audio tap for the camera-mode pitch widget.
 *
 * PCM chunks come from an AVCaptureAudioDataOutput on the SAME capture session
 * that records video — so pitch analysis works before, during, and after a
 * recording with zero mic contention (unlike the old WebKit getUserMedia path,
 * which the native camera session starves).
 */

export interface NativeAudioPitchChunk {
  /** Mono Float32 samples. */
  samples: Float32Array
  sampleRate: number
}

/**
 * Ref-counted tap enable: multiple pitch widgets (main camera widget, multitrack
 * practice overlay) can share the single native tap without fighting over it.
 */
let tapRefCount = 0
let tapActive = false
let tapOperation: Promise<void> = Promise.resolve()
let tunerMonitorRefCount = 0
let tunerMonitorActive = false
let tunerMonitorOperation: Promise<void> = Promise.resolve()

function enqueueTunerMonitorOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = tunerMonitorOperation.then(operation, operation)
  tunerMonitorOperation = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

function enqueueTapOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = tapOperation.then(operation, operation)
  tapOperation = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

async function startTunerMonitor(
  micInputPreference?: MicInputPreference,
): Promise<boolean> {
  if (!isNativeCameraTestAvailable()) return false
  try {
    const result = await BestTakeAudioPlugin.startNativeTunerMonitor({
      micInputPreference,
    })
    const active = result.active === true
    tunerMonitorActive = active
    setNativeAudioCaptureActive(active)
    return active
  } catch (error) {
    tunerMonitorActive = false
    if (!isNativeCaptureSessionActive()) {
      setNativeAudioCaptureActive(false)
    }
    console.warn('[PitchTap] native tuner monitor start failed', error)
    return false
  }
}

async function stopTunerMonitor(): Promise<void> {
  try {
    const result = await BestTakeAudioPlugin.stopNativeTunerMonitor()
    setNativeAudioCaptureActive(result.active === true)
  } catch (error) {
    console.warn('[PitchTap] native tuner monitor stop failed', error)
  } finally {
    tunerMonitorActive = false
  }
}

export async function acquireNativeTunerMonitor(
  micInputPreference?: MicInputPreference,
): Promise<boolean> {
  if (!isNativeCameraTestAvailable()) return false
  tunerMonitorRefCount += 1
  return enqueueTunerMonitorOperation(async () => {
    if (tunerMonitorRefCount === 0) return false
    if (tunerMonitorActive) return true
    const active = await startTunerMonitor(micInputPreference)
    if (active && tunerMonitorRefCount === 0) {
      await stopTunerMonitor()
      return false
    }
    return active
  })
}

export async function recoverNativeTunerMonitor(
  micInputPreference?: MicInputPreference,
): Promise<boolean> {
  if (!isNativeCameraTestAvailable() || tunerMonitorRefCount === 0) return false
  return enqueueTunerMonitorOperation(async () => {
    if (tunerMonitorRefCount === 0) return false
    const active = await startTunerMonitor(micInputPreference)
    if (active && tunerMonitorRefCount === 0) {
      await stopTunerMonitor()
      return false
    }
    return active
  })
}

export async function releaseNativeTunerMonitor(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  tunerMonitorRefCount = Math.max(0, tunerMonitorRefCount - 1)
  if (tunerMonitorRefCount > 0) return

  await enqueueTunerMonitorOperation(async () => {
    if (tunerMonitorRefCount > 0) return
    await stopTunerMonitor()
  })
}

export async function acquireNativeAudioTap(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  tapRefCount += 1
  await enqueueTapOperation(async () => {
    if (tapRefCount === 0 || tapActive) return
    try {
      await BestTakeAudioPlugin.setNativeAudioTapEnabled({ enabled: true })
      tapActive = true
      console.info('[PitchTap] JS enabled native audio tap')
    } catch (error) {
      tapActive = false
      console.warn('[PitchTap] JS enable failed', error)
    }
  })
}

export async function releaseNativeAudioTap(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  tapRefCount = Math.max(0, tapRefCount - 1)
  await enqueueTapOperation(async () => {
    if (tapRefCount > 0 || !tapActive) return
    try {
      await BestTakeAudioPlugin.setNativeAudioTapEnabled({ enabled: false })
    } catch (error) {
      console.warn('[NativeAudioTap] disable failed', error)
    } finally {
      tapActive = false
    }
  })
}

function decodePcmBase64(pcmBase64: string): Float32Array | null {
  try {
    const binary = atob(pcmBase64)
    // Fresh ArrayBuffer guarantees the 4-byte alignment Float32Array needs.
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Float32Array(bytes.buffer)
  } catch {
    return null
  }
}

type PitchFrameSubscriber = (chunk: NativeAudioPitchChunk) => void

const pitchFrameSubscribers = new Set<PitchFrameSubscriber>()
let sharedPitchFrameListener: PluginListenerHandle | null = null
let sharedPitchFrameListenerPromise: Promise<PluginListenerHandle> | null = null
let loggedFirstPitchFrame = false
let loggedPitchSubscriberFailure = false

function ensureSharedPitchFrameListener(): Promise<PluginListenerHandle> {
  if (sharedPitchFrameListener) return Promise.resolve(sharedPitchFrameListener)
  if (sharedPitchFrameListenerPromise) return sharedPitchFrameListenerPromise

  const pending = BestTakeAudioPlugin.addListener('nativeAudioPitchFrame', (event) => {
    if (!event.pcmBase64 || !event.sampleRate) return
    const samples = decodePcmBase64(event.pcmBase64)
    if (!samples || samples.length === 0) return
    if (!loggedFirstPitchFrame) {
      loggedFirstPitchFrame = true
      console.info(
        `[PitchTap] JS received first PCM frame (${samples.length} samples @ ${event.sampleRate}Hz)`,
      )
    }
    const chunk = { samples, sampleRate: event.sampleRate }
    for (const subscriber of [...pitchFrameSubscribers]) {
      try {
        subscriber(chunk)
      } catch (error) {
        if (!loggedPitchSubscriberFailure) {
          loggedPitchSubscriberFailure = true
          console.warn('[PitchTap] subscriber failed', error)
        }
      }
    }
  }).then(async (handle) => {
    if (pitchFrameSubscribers.size === 0) {
      await handle.remove()
      return { remove: async () => {} }
    }
    sharedPitchFrameListener = handle
    return handle
  }).finally(() => {
    if (sharedPitchFrameListenerPromise === pending) {
      sharedPitchFrameListenerPromise = null
    }
  })

  sharedPitchFrameListenerPromise = pending
  return pending
}

async function releaseSharedPitchFrameListenerIfIdle(): Promise<void> {
  if (pitchFrameSubscribers.size > 0) return
  const handle = sharedPitchFrameListener
  sharedPitchFrameListener = null
  await handle?.remove()
}

export function subscribeNativeAudioPitchFrames(
  onChunk: (chunk: NativeAudioPitchChunk) => void,
): Promise<PluginListenerHandle> | null {
  if (!isNativeCameraTestAvailable()) return null
  pitchFrameSubscribers.add(onChunk)
  let removed = false
  const listenerReady = ensureSharedPitchFrameListener()

  // Return the subscription wrapper immediately. Waiting for Capacitor's
  // asynchronous addListener call before exposing remove() meant a quick tab
  // switch could retain an abandoned graph callback until the bridge replied.
  void listenerReady.catch(() => {
    pitchFrameSubscribers.delete(onChunk)
    void releaseSharedPitchFrameListenerIfIdle()
  })

  return Promise.resolve({
    remove: async () => {
      if (removed) return
      removed = true
      pitchFrameSubscribers.delete(onChunk)
      await listenerReady.catch(() => undefined)
      await releaseSharedPitchFrameListenerIfIdle()
    },
  })
}

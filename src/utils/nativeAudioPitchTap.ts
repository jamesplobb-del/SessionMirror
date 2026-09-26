import type { PluginListenerHandle } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isNativeCameraTestAvailable } from './nativeCameraTest'
import {
  isNativeCaptureSessionActive,
  setNativeAudioCaptureActive,
} from './cameraSessionState'
import type { MicInputPreference } from './appSettings'
import { claimNativeTunerMicrophone, releaseNativeTunerMicrophone } from './tunerMicrophoneOwnership'

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
let deferredTapDisableTimer: number | null = null
let tunerMonitorRefCount = 0
let tunerMonitorOperation: Promise<void> = Promise.resolve()
let tunerRecovery: { preference: MicInputPreference | undefined; result: Promise<boolean> } | null = null

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
    await claimNativeTunerMicrophone()
    const result = await BestTakeAudioPlugin.startNativeTunerMonitor({
      micInputPreference,
    })
    const active = result.active === true
    setNativeAudioCaptureActive(active)
    if (!active) releaseNativeTunerMicrophone(false)
    return active
  } catch (error) {
    releaseNativeTunerMicrophone(false)
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
    releaseNativeTunerMicrophone()
  }
}

export async function acquireNativeTunerMonitor(
  micInputPreference?: MicInputPreference,
): Promise<boolean> {
  if (!isNativeCameraTestAvailable()) return false
  tunerMonitorRefCount += 1
  return enqueueTunerMonitorOperation(async () => {
    if (tunerMonitorRefCount === 0) return false
    // A routine or interruption may have replaced native capture since the
    // last lease. Revalidate with native on every screen activation.
    const active = await startTunerMonitor(micInputPreference)
    if (active && tunerMonitorRefCount === 0) {
      // releaseNativeTunerMonitor already queued the stop behind this start.
      // Stopping here too would restore the audio route twice.
      return false
    }
    return active
  })
}

export async function recoverNativeTunerMonitor(
  micInputPreference?: MicInputPreference,
): Promise<boolean> {
  if (!isNativeCameraTestAvailable() || tunerMonitorRefCount === 0) return false
  if (tunerRecovery && tunerRecovery.preference === micInputPreference) return tunerRecovery.result
  const result = enqueueTunerMonitorOperation(async () => {
    if (tunerMonitorRefCount === 0) return false
    const active = await startTunerMonitor(micInputPreference)
    if (active && tunerMonitorRefCount === 0) {
      return false
    }
    return active
  })
  const recovery = { preference: micInputPreference, result }
  tunerRecovery = recovery
  void result.then(() => {
    if (tunerRecovery === recovery) tunerRecovery = null
  })
  return result
}

export async function releaseNativeTunerMonitor(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  // Cleanup can race an explicit playback handoff. An already-released lease
  // must not stop the capture session again after playback has claimed it.
  // The last owner's cleanup may already have queued its native stop. A
  // playback handoff calling release again must wait for that stop to finish
  // before it claims the speaker, even though there is no lease left to drop.
  if (tunerMonitorRefCount === 0) return tunerMonitorOperation
  tunerMonitorRefCount -= 1
  if (tunerMonitorRefCount > 0) return

  await enqueueTunerMonitorOperation(async () => {
    if (tunerMonitorRefCount > 0) return
    await stopTunerMonitor()
  })
}

export async function acquireNativeAudioTap(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  if (deferredTapDisableTimer !== null) {
    window.clearTimeout(deferredTapDisableTimer)
    deferredTapDisableTimer = null
  }
  tapRefCount += 1
  await enqueueTapOperation(async () => {
    if (tapRefCount === 0 || tapActive) return
    try {
      await ensureSharedPitchFrameListener()
      await BestTakeAudioPlugin.setNativeAudioTapEnabled({ enabled: true, completionDelivery: true })
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
  // A monitor cleanup can race native hands-free startup. Native capture is
  // already delivering the PCM frames the next monitor needs; disabling the
  // shared tap here leaves the UI permanently on “Getting ready”. Defer the
  // final disable until the native session is idle, giving the replacement
  // monitor time to claim its lease.
  if (tapRefCount === 0 && isNativeCaptureSessionActive()) {
    if (deferredTapDisableTimer === null) {
      deferredTapDisableTimer = window.setTimeout(() => {
        deferredTapDisableTimer = null
        void releaseNativeAudioTap()
      }, 750)
    }
    return
  }
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
let completionFrameReceiverInstalled = false
let loggedFirstPitchFrame = false
let loggedPitchSubscriberFailure = false

function ensureSharedPitchFrameListener(): Promise<PluginListenerHandle> {
  if (sharedPitchFrameListener) return Promise.resolve(sharedPitchFrameListener)
  if (sharedPitchFrameListenerPromise) return sharedPitchFrameListenerPromise

  const handleFrame = (event: { pcmBase64?: string; sampleRate?: number; sampleCount?: number }) => {
    // Keep the bridge listener for the lifetime of the app, but skip decoding
    // entirely while no pitch feature is using it. Removing and recreating the
    // listener during a quick Games -> Tuner switch can race Capacitor's
    // asynchronous addListener response and leave the new tuner subscribed to
    // a listener that was already removed.
    if (pitchFrameSubscribers.size === 0) return
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
  }
  // Native completion delivery uses the WebView completion callback as credit,
  // rather than a second JS-to-native RPC that can leave the tap starved.
  if (typeof window !== 'undefined' && !completionFrameReceiverInstalled) {
    window.addEventListener('besttake:native-pitch-frame', (event) => {
      handleFrame((event as CustomEvent).detail ?? {})
    })
    completionFrameReceiverInstalled = true
  }
  const pending = BestTakeAudioPlugin.addListener('nativeAudioPitchFrame', handleFrame).then((handle) => {
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
  // Deliberately retain the single bridge receiver. Subscriber callbacks are
  // still removed immediately, and releaseNativeAudioTap disables native PCM
  // production when the final pitch graph closes. This avoids an async
  // remove/add race without leaving the microphone or decoder running.
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
  // A failed bridge registration is retried when the pitch graph watchdog
  // recreates its subscription. Keep this subscriber until its own graph is
  // disposed so a late recovery cannot lose the callback.
  void listenerReady.catch(() => {})

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

import type { PluginListenerHandle } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isNativeCameraTestAvailable } from './nativeCameraTest'
import { setNativeAudioCaptureActive } from './cameraSessionState'
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
let tunerMonitorRefCount = 0
let tunerMonitorStart: Promise<boolean> | null = null

async function startTunerMonitor(
  micInputPreference?: MicInputPreference,
): Promise<boolean> {
  if (!isNativeCameraTestAvailable()) return false
  try {
    const result = await BestTakeAudioPlugin.startNativeTunerMonitor({
      micInputPreference,
    })
    const active = result.active === true
    setNativeAudioCaptureActive(active)
    return active
  } catch (error) {
    setNativeAudioCaptureActive(false)
    console.warn('[PitchTap] native tuner monitor start failed', error)
    return false
  }
}

export async function acquireNativeTunerMonitor(
  micInputPreference?: MicInputPreference,
): Promise<boolean> {
  if (!isNativeCameraTestAvailable()) return false
  tunerMonitorRefCount += 1
  if (!tunerMonitorStart) {
    tunerMonitorStart = startTunerMonitor(micInputPreference).finally(() => {
      tunerMonitorStart = null
    })
  }
  return tunerMonitorStart
}

export async function recoverNativeTunerMonitor(
  micInputPreference?: MicInputPreference,
): Promise<boolean> {
  if (!isNativeCameraTestAvailable() || tunerMonitorRefCount === 0) return false
  if (!tunerMonitorStart) {
    tunerMonitorStart = startTunerMonitor(micInputPreference).finally(() => {
      tunerMonitorStart = null
    })
  }
  return tunerMonitorStart
}

export async function releaseNativeTunerMonitor(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  tunerMonitorRefCount = Math.max(0, tunerMonitorRefCount - 1)
  if (tunerMonitorRefCount > 0) return

  await tunerMonitorStart?.catch(() => false)
  try {
    await BestTakeAudioPlugin.stopNativeTunerMonitor()
  } catch (error) {
    console.warn('[PitchTap] native tuner monitor stop failed', error)
  } finally {
    setNativeAudioCaptureActive(false)
  }
}

export async function acquireNativeAudioTap(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  tapRefCount += 1
  if (tapRefCount === 1) {
    try {
      await BestTakeAudioPlugin.setNativeAudioTapEnabled({ enabled: true })
      console.info('[PitchTap] JS enabled native audio tap')
    } catch (error) {
      console.warn('[PitchTap] JS enable failed', error)
    }
  }
}

export async function releaseNativeAudioTap(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  tapRefCount = Math.max(0, tapRefCount - 1)
  if (tapRefCount === 0) {
    try {
      await BestTakeAudioPlugin.setNativeAudioTapEnabled({ enabled: false })
    } catch (error) {
      console.warn('[NativeAudioTap] disable failed', error)
    }
  }
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

export function subscribeNativeAudioPitchFrames(
  onChunk: (chunk: NativeAudioPitchChunk) => void,
): Promise<PluginListenerHandle> | null {
  if (!isNativeCameraTestAvailable()) return null
  let loggedFirst = false
  return BestTakeAudioPlugin.addListener('nativeAudioPitchFrame', (event) => {
    if (!event.pcmBase64 || !event.sampleRate) return
    const samples = decodePcmBase64(event.pcmBase64)
    if (!samples || samples.length === 0) return
    if (!loggedFirst) {
      loggedFirst = true
      console.info(`[PitchTap] JS received first PCM frame (${samples.length} samples @ ${event.sampleRate}Hz)`)
    }
    onChunk({ samples, sampleRate: event.sampleRate })
  })
}

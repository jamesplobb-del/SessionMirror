import type { PluginListenerHandle } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isNativeCameraTestAvailable } from './nativeCameraTest'

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

export async function acquireNativeAudioTap(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  tapRefCount += 1
  if (tapRefCount === 1) {
    try {
      await BestTakeAudioPlugin.setNativeAudioTapEnabled({ enabled: true })
    } catch (error) {
      console.warn('[NativeAudioTap] enable failed', error)
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
  return BestTakeAudioPlugin.addListener('nativeAudioPitchFrame', (event) => {
    if (!event.pcmBase64 || !event.sampleRate) return
    const samples = decodePcmBase64(event.pcmBase64)
    if (!samples || samples.length === 0) return
    onChunk({ samples, sampleRate: event.sampleRate })
  })
}

import { useEffect, useState } from 'react'
import { useCapacitorVideoSrc } from './useCapacitorVideoSrc'
import { extractNativeWaveformPeaks } from '../utils/nativeWaveform'

interface UseMediaWaveformOptions {
  filePath: string
  mediaUrl: string
  barCount?: number
  /** When false, return [] until real peaks exist instead of a placeholder shape. */
  placeholder?: boolean
}

/**
 * Ceiling for the JavaScript decode fallback.
 *
 * That path costs roughly 2x the file size (fetch + the `.slice(0)` copy the
 * decoder needs) PLUS the decoded stereo Float32 PCM — for a 20 minute 1080p
 * take that is several gigabytes inside the WebView, which iOS answers by
 * killing the app. Anything above this is left on the placeholder waveform
 * rather than risking the process. Native takes never reach it.
 */
const MAX_JS_DECODE_BYTES = 48 * 1024 * 1024

function fallbackPeaks(barCount: number): number[] {
  return Array.from({ length: barCount }, (_, index) => {
    const a = Math.sin(index * 0.47) * 0.5 + 0.5
    const b = Math.sin(index * 0.19 + 1.4) * 0.5 + 0.5
    return 0.16 + (a * 0.58 + b * 0.42) * 0.74
  })
}

function buildPeaks(buffer: AudioBuffer, barCount: number): number[] {
  const channelCount = Math.max(1, buffer.numberOfChannels)
  const length = buffer.length
  const samplesPerBar = Math.max(1, Math.floor(length / barCount))
  const peaks: number[] = []

  for (let bar = 0; bar < barCount; bar += 1) {
    const start = bar * samplesPerBar
    const end = bar === barCount - 1 ? length : Math.min(length, start + samplesPerBar)
    let sum = 0
    let count = 0

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = buffer.getChannelData(channel)
      for (let i = start; i < end; i += 32) {
        sum += Math.abs(data[i] ?? 0)
        count += 1
      }
    }

    peaks.push(count > 0 ? sum / count : 0)
  }

  const max = Math.max(...peaks, 0.001)
  return peaks.map((peak) => Math.max(0.08, Math.min(1, Math.pow(peak / max, 0.72))))
}

/** Best-effort size probe so the decode below can refuse oversized media. */
async function probeByteLength(src: string): Promise<number | null> {
  try {
    const response = await fetch(src, { method: 'HEAD' })
    const length = response.headers.get('content-length')
    if (!length) return null
    const parsed = Number.parseInt(length, 10)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function useMediaWaveform({
  filePath,
  mediaUrl,
  barCount = 72,
  placeholder = true,
}: UseMediaWaveformOptions): number[] {
  const resolvedSrc = useCapacitorVideoSrc(filePath, mediaUrl)
  const emptyPeaks = placeholder ? fallbackPeaks(barCount) : []
  const [peaks, setPeaks] = useState<number[]>(() => emptyPeaks)

  useEffect(() => {
    if (!resolvedSrc) {
      setPeaks(placeholder ? fallbackPeaks(barCount) : [])
      return
    }

    let cancelled = false
    let audioContext: AudioContext | null = null

    void (async () => {
      // Native reads the audio track alone, streamed and off the main thread,
      // instead of pulling the whole container through the WebView.
      try {
        const nativePeaks = await extractNativeWaveformPeaks({ filePath, videoUrl: mediaUrl }, barCount)
        if (cancelled) return
        if (nativePeaks) {
          setPeaks(nativePeaks)
          return
        }
      } catch (error) {
        console.warn('[Waveform] native extract failed, trying decode', error)
        if (cancelled) return
      }

      const byteLength = await probeByteLength(resolvedSrc)
      if (cancelled) return
      if (byteLength !== null && byteLength > MAX_JS_DECODE_BYTES) {
        console.info('[Waveform] skipping decode — media too large for the WebView', {
          byteLength,
        })
        setPeaks(placeholder ? fallbackPeaks(barCount) : [])
        return
      }

      try {
        const response = await fetch(resolvedSrc)
        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return
        if (arrayBuffer.byteLength > MAX_JS_DECODE_BYTES) {
          console.info('[Waveform] skipping decode — media too large for the WebView', {
            byteLength: arrayBuffer.byteLength,
          })
          setPeaks(placeholder ? fallbackPeaks(barCount) : [])
          return
        }
        const AudioContextCtor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioContextCtor) return
        audioContext = new AudioContextCtor({ latencyHint: 'playback' })
        const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
        if (!cancelled) {
          setPeaks(buildPeaks(decoded, barCount))
        }
      } catch (error) {
        console.warn('Waveform decode failed:', error)
        if (!cancelled) {
          setPeaks(placeholder ? fallbackPeaks(barCount) : [])
        }
      } finally {
        void audioContext?.close().catch(() => undefined)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [barCount, filePath, mediaUrl, placeholder, resolvedSrc])

  return peaks
}

import { useEffect, useState } from 'react'
import { useCapacitorVideoSrc } from './useCapacitorVideoSrc'

interface UseMediaWaveformOptions {
  filePath: string
  mediaUrl: string
  barCount?: number
}

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

export function useMediaWaveform({
  filePath,
  mediaUrl,
  barCount = 72,
}: UseMediaWaveformOptions): number[] {
  const resolvedSrc = useCapacitorVideoSrc(filePath, mediaUrl)
  const [peaks, setPeaks] = useState<number[]>(() => fallbackPeaks(barCount))

  useEffect(() => {
    if (!resolvedSrc) {
      setPeaks(fallbackPeaks(barCount))
      return
    }

    let cancelled = false
    let audioContext: AudioContext | null = null

    void (async () => {
      try {
        const response = await fetch(resolvedSrc)
        const arrayBuffer = await response.arrayBuffer()
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
          setPeaks(fallbackPeaks(barCount))
        }
      } finally {
        void audioContext?.close().catch(() => undefined)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [barCount, resolvedSrc])

  return peaks
}

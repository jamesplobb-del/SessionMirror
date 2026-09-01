import { useCallback, useEffect, useRef, useState } from 'react'

const TARGET_BARS = 96

function downsample(samples: number[], count: number): number[] {
  if (samples.length === 0) return []
  if (samples.length <= count) return samples.slice()
  const result: number[] = []
  const bucket = samples.length / count
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor(index * bucket)
    const end = Math.max(start + 1, Math.floor((index + 1) * bucket))
    let peak = 0
    for (let cursor = start; cursor < end; cursor += 1) {
      peak = Math.max(peak, samples[cursor] ?? 0)
    }
    result.push(peak)
  }
  return result
}

/**
 * Accumulates live mic envelopes into a take-shaped ribbon. While recording
 * the path grows left to right; after TARGET_BARS samples it stays full width
 * and densifies. The frozen path is Current until a decoded waveform exists.
 */
export function useWrittenTakeWaveform(isRecording: boolean, livePeaks: number[]) {
  const samplesRef = useRef<number[]>([])
  const recordingRef = useRef(false)
  const [peaks, setPeaks] = useState<number[]>([])

  const reset = useCallback(() => {
    samplesRef.current = []
    setPeaks([])
  }, [])

  useEffect(() => {
    if (isRecording && !recordingRef.current) {
      samplesRef.current = []
      setPeaks([])
    }
    recordingRef.current = isRecording
    if (!isRecording) return

    const latest = livePeaks[livePeaks.length - 1]
    if (latest == null) return
    samplesRef.current.push(latest)
    setPeaks(downsample(samplesRef.current, TARGET_BARS))
  }, [isRecording, livePeaks])

  const sampleCount = samplesRef.current.length
  const writeProgress = isRecording
    ? Math.min(1, Math.max(sampleCount > 0 ? 0.06 : 0, sampleCount / TARGET_BARS))
    : sampleCount > 0
      ? 1
      : 0

  return { peaks, writeProgress, sampleCount, reset }
}

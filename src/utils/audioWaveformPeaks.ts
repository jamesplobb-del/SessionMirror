const peakCache = new Map<string, Float32Array>()

function downsamplePeaks(channel: Float32Array, barCount: number): Float32Array {
  const peaks = new Float32Array(barCount)
  const blockSize = Math.max(1, Math.floor(channel.length / barCount))

  for (let i = 0; i < barCount; i++) {
    const start = i * blockSize
    const end = Math.min(channel.length, start + blockSize)
    let peak = 0
    for (let j = start; j < end; j++) {
      const sample = Math.abs(channel[j] ?? 0)
      if (sample > peak) peak = sample
    }
    peaks[i] = peak
  }

  return peaks
}

/** Decode playback URL into normalized peak bars (cached per take id). */
export async function decodeAudioPeaks(
  takeId: string,
  playbackUrl: string,
  barCount = 64,
): Promise<Float32Array | null> {
  const cached = peakCache.get(takeId)
  if (cached) return cached

  if (!playbackUrl) return null

  let ctx: AudioContext | null = null
  try {
    ctx = new AudioContext()
    const response = await fetch(playbackUrl)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    const channel = buffer.getChannelData(0)
    const peaks = downsamplePeaks(channel, barCount)

    let max = 0
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i] > max) max = peaks[i]
    }
    if (max > 0) {
      for (let i = 0; i < peaks.length; i++) {
        peaks[i] /= max
      }
    }

    peakCache.set(takeId, peaks)
    return peaks
  } catch {
    return null
  } finally {
    if (ctx && ctx.state !== 'closed') {
      await ctx.close().catch(() => {})
    }
  }
}

export function clearAudioPeakCache(takeId?: string): void {
  if (takeId) {
    peakCache.delete(takeId)
    return
  }
  peakCache.clear()
}

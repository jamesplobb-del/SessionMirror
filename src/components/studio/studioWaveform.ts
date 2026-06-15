/** Downsample PCM peaks for canvas waveform rendering. */
export function extractWaveformPeaks(
  buffer: AudioBuffer,
  targetPoints: number,
): Float32Array {
  const channel = buffer.getChannelData(0)
  const blockSize = Math.max(1, Math.floor(channel.length / targetPoints))
  const peaks = new Float32Array(targetPoints)

  for (let index = 0; index < targetPoints; index += 1) {
    const start = index * blockSize
    const end = Math.min(channel.length, start + blockSize)
    let peak = 0
    for (let sample = start; sample < end; sample += 1) {
      const value = Math.abs(channel[sample] ?? 0)
      if (value > peak) peak = value
    }
    peaks[index] = peak
  }

  return peaks
}

export function drawWaveformPeaks(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array,
  width: number,
  height: number,
  color = 'rgba(56, 189, 248, 0.85)',
): void {
  const midY = height / 2
  const step = width / peaks.length

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()

  for (let index = 0; index < peaks.length; index += 1) {
    const x = index * step + step / 2
    const amplitude = (peaks[index] ?? 0) * (height * 0.42)
    ctx.moveTo(x, midY - amplitude)
    ctx.lineTo(x, midY + amplitude)
  }

  ctx.stroke()
}

export function secondsToRatio(seconds: number, duration: number): number {
  if (duration <= 0) return 0
  return Math.max(0, Math.min(1, seconds / duration))
}

export function ratioToSeconds(ratio: number, duration: number): number {
  return Math.max(0, Math.min(duration, ratio * duration))
}

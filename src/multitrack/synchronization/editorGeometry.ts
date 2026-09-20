/** Bound backing-store memory even for hour-long recordings at maximum zoom. */
export function waveformRasterSize(width: number, height: number, dpr: number) {
  const scale = Math.max(1, Math.min(2, dpr || 1))
  return { width: Math.max(1, Math.min(2048, Math.ceil(width * scale))),
    height: Math.max(1, Math.min(256, Math.ceil(height * scale))) }
}

export function visibleRulerSeconds(duration: number, pxPerSec: number, left: number, width: number, origin: number) {
  const start = Math.max(0, Math.floor((left - origin) / pxPerSec) - 2)
  const end = Math.min(Math.ceil(duration) + 1, Math.ceil((left + width - origin) / pxPerSec) + 2)
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i)
}

/** Trim a source edge while leaving every retained sample at its original song time. */
export function trimWaveformEdge(clip: { trimStart: number; trimEnd?: number; duration: number; offsetMs: number }, edge: 'start' | 'end', deltaSec: number) {
  const duration = Math.max(0, clip.duration)
  const end = Math.min(duration, clip.trimEnd ?? duration)
  const minimum = Math.min(.2, duration)
  if (!Number.isFinite(deltaSec)) return {}
  if (edge === 'start') {
    const trimStart = Math.round(Math.max(0, Math.min(end - minimum, clip.trimStart + deltaSec)) * 1000) / 1000
    return { trimStart, offsetMs: Math.round(clip.offsetMs - (trimStart - clip.trimStart) * 1000) }
  }
  const next = Math.max(clip.trimStart + minimum, Math.min(duration, end + deltaSec))
  return { trimEnd: next >= duration - .02 ? undefined : Math.round(next * 1000) / 1000 }
}

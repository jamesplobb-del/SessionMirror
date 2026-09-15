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

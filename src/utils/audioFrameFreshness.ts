/** Polling must not turn one bridged PCM chunk into several sound samples. */
export function createAudioFrameFreshness(maxGapMs = 150) {
  let consumedAt: number | null = null
  return (timestamp: number | undefined, now: number): 'fresh' | 'gap' | 'waiting' | 'stale' => {
    if (timestamp === undefined || !Number.isFinite(timestamp) || !Number.isFinite(now) ||
        now < timestamp || now - timestamp > maxGapMs) return 'stale'
    if (timestamp === consumedAt) return 'waiting'
    if (consumedAt !== null && timestamp < consumedAt) return 'stale'
    const gap = consumedAt !== null && timestamp - consumedAt > maxGapMs
    consumedAt = timestamp
    return gap ? 'gap' : 'fresh'
  }
}

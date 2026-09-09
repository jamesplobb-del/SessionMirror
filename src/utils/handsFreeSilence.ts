/** Counts silence between fresh quiet observations, tolerating bridge jitter.
 * No repeated frame or missing-data poll advances the clock. */
export function createHandsFreeSilence() {
  let quietMs = 0
  let previousAt: number | null = null
  return {
    reset() { quietMs = 0; previousAt = null },
    sample(now: number, loud: boolean, targetMs: number, frameMs: number) {
      if (loud) {
        quietMs = 0
        previousAt = null
        return { stop: false, remainingSeconds: null }
      }
      const delta = previousAt === null ? 0 : now - previousAt
      // Silence needs a longer tolerance than the attack gate: modest bridge
      // jitter should not postpone replay forever. After a one-second outage,
      // count only this frame's duration. Outages cannot finish a take alone.
      quietMs += delta > 0 && delta <= 1000 ? delta : Math.max(0, Math.min(frameMs, 150))
      previousAt = now
      return {
        stop: quietMs >= targetMs,
        remainingSeconds: Math.max(0, Math.ceil((targetMs - quietMs) / 1000)),
      }
    },
  }
}

/** Bounded session diagnostics. These are symptoms, not claims about what was played. */
export function createHandsFreeHealth() {
  let blockedSince: number | null = null
  let shortTakes: number[] = []
  return {
    reset() { blockedSince = null; shortTakes = [] },
    observeArming(now: number, blocked: boolean) {
      if (!blocked) { blockedSince = null; return false }
      blockedSince ??= now
      return now - blockedSince >= 6000
    },
    finished(now: number, performanceMs: number) {
      shortTakes = shortTakes.filter(at => now - at < 60000)
      if (performanceMs <= 1500) shortTakes.push(now)
      else shortTakes = []
      shortTakes = shortTakes.slice(-3)
      return shortTakes.length >= 3
    },
  }
}

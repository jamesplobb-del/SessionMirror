/** Run work after the next paint so UI transitions start immediately. */
export function scheduleAfterPaint(work: () => void): void {
  if (typeof window === 'undefined') {
    work()
    return
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(work)
  })
}

/** Run work after a short delay — useful for deferring heavy hydration. */
export function scheduleIdle(work: () => void, delayMs = 120): () => void {
  if (typeof window === 'undefined') {
    work()
    return () => {}
  }

  const timer = window.setTimeout(work, delayMs)
  return () => window.clearTimeout(timer)
}

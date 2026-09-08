/** One microphone transition per screen activation. Cancellation prevents a
 * late native result from opening WebKit capture after the musician leaves. */
export function createAudioRecovery() {
  let generation = 0
  let pending: Promise<boolean> | null = null

  return {
    cancel() {
      generation += 1
      pending = null
    },
    run(operation: (isCurrent: () => boolean) => Promise<boolean>): Promise<boolean> {
      if (pending) return pending
      const startedIn = generation
      const isCurrent = () => generation === startedIn
      // Start synchronously so callers can acquire their native monitor lease
      // before React runs an effect cleanup (including StrictMode cleanup).
      const result = (async () => {
        try {
          const active = await operation(isCurrent)
          return isCurrent() && active
        } catch (error) {
          console.warn('[AudioRecovery] microphone transition failed', error)
          return false
        }
      })()
      pending = result
      void result.then(() => {
        if (pending === result) pending = null
      })
      return result
    },
  }
}

/**
 * Bring a practice game's microphone back after the app has been away.
 *
 * iOS tears down or suspends a WKWebView capture stream when the app is
 * backgrounded, locked, or merely left idle long enough. Coming back, the
 * stream object often still looks present while its tracks are dead, so
 * nothing throws and nothing retries — the game simply sits there detecting no
 * pitch and showing no level, which is exactly the state the games were left
 * in. The tuner has had a recovery path for this for a while; the games were
 * calling `onRequestMicStream()` once on mount and never again.
 *
 * The app already publishes the lifecycle this needs — `subscribeAppForeground`
 * for the transition and `APP_INTERACTIVE_MEDIA_RECOVERY_EVENT` for the
 * settled second pass and for manual "wake up" gestures — so this listens to
 * both rather than inventing another visibility watcher.
 *
 * Recovery is two things, and both are needed: re-acquiring the stream, and
 * rebuilding the analysis graph on top of it. The returned epoch is the
 * second half — folded into a tracker's key it forces a fresh AudioContext and
 * analyser, since a context suspended in the background does not start itself
 * again just because a live stream reappeared.
 */
import { useEffect, useRef, useState } from 'react'
import {
  APP_INTERACTIVE_MEDIA_RECOVERY_EVENT,
  isAppInForeground,
  subscribeAppForeground,
} from '../utils/appForeground'

/**
 * `false` means "not mine yet, ask again" — the shared camera lifecycle owns
 * the first attempt at rebuilding and this has to let it finish. Anything else
 * (including a handler that returns nothing) counts as settled.
 */
export type GameMicRequest = (options?: { forceRecovery?: boolean }) => void | Promise<boolean>

/**
 * Waits between attempts. The first is immediate, then it backs off — a stream
 * rebuild on a cold resume routinely takes a second or more, and hammering it
 * only opens competing microphones.
 */
const RECOVERY_BACKOFF_MS = [0, 350, 900, 1600] as const

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function useGameMicRecovery(active: boolean, onRequestMicStream: GameMicRequest): number {
  const [micEpoch, setMicEpoch] = useState(0)

  const requestRef = useRef(onRequestMicStream)
  requestRef.current = onRequestMicStream
  const activeRef = useRef(active)
  activeRef.current = active
  /** One recovery at a time: foreground and the settled pass both fire. */
  const runningRef = useRef(false)

  useEffect(() => {
    if (!active) return
    let cancelled = false

    const stillWanted = () => !cancelled && activeRef.current && isAppInForeground()

    const recover = async () => {
      if (runningRef.current || !stillWanted()) return
      runningRef.current = true
      try {
        for (let attempt = 0; attempt < RECOVERY_BACKOFF_MS.length; attempt += 1) {
          if (RECOVERY_BACKOFF_MS[attempt]! > 0) await waitMs(RECOVERY_BACKOFF_MS[attempt]!)
          if (!stillWanted()) return
          const settled = await requestRef.current({ forceRecovery: true })
          if (!stillWanted()) return
          if (settled !== false) break
        }
        // Rebuild the analysis graph even when the last attempt gave up: a
        // stalled tracker on a live stream is the failure being fixed here,
        // and a rebuild is cheap next to leaving the game deaf.
        setMicEpoch((value) => value + 1)
      } finally {
        runningRef.current = false
      }
    }

    const handleForeground = (foreground: boolean) => {
      if (foreground) void recover()
    }
    const handleRecoveryEvent = () => {
      void recover()
    }

    const unsubscribe = subscribeAppForeground(handleForeground)
    window.addEventListener(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, handleRecoveryEvent)
    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, handleRecoveryEvent)
    }
  }, [active])

  return micEpoch
}

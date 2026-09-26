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
 *
 * Events are not the only way to lose the microphone, so a game that passes
 * its stream also has it checked. Some losses fire nothing: the rebuild floor
 * turning down the request of a game entered straight after another, a
 * foreground rebuild that failed, a track ended or muted mid-game. A stream
 * still dead on the next check gets the same forced recovery a return to the
 * app does — a bounded number of times, re-armed by the next return or tap,
 * because each attempt can reopen capture hardware.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  APP_INTERACTIVE_MEDIA_RECOVERY_EVENT,
  isAppInForeground,
  subscribeAppForeground,
} from '../utils/appForeground'
import { isNativeCaptureSessionActive } from '../utils/cameraSessionState'

/**
 * `false` means "not mine yet, ask again" — the shared camera lifecycle owns
 * the first attempt at rebuilding and this has to let it finish. Anything else
 * (including a handler that returns nothing) counts as settled.
 */
export type GameMicRequest = (options?: { forceRecovery?: boolean }) => void | Promise<boolean>

export interface GameMicHealth {
  /** The shared stream the game's tracker listens through. */
  streamRef: RefObject<MediaStream | null>
  /**
   * A permission prompt is up. Forcing capture now would queue a second
   * request behind it and throw the first answer away.
   */
  permissionPending?: boolean
}

/**
 * Waits between attempts. The first is immediate, then it backs off — a stream
 * rebuild on a cold resume routinely takes a second or more, and hammering it
 * only opens competing microphones.
 */
const RECOVERY_BACKOFF_MS = [0, 350, 900, 1600] as const

/** How often a game that wants the microphone checks the shared stream. */
const HEALTH_CHECK_MS = 1500

/**
 * Recoveries the check may start on its own before it waits for the player.
 * An uncapped self-heal once rebuilt capture about sixty times a second and
 * crashed the app.
 */
const MAX_HEALTH_RECOVERIES = 3

/** Floor between two recoveries the check starts. */
const HEALTH_RECOVERY_FLOOR_MS = 5000

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** The test the pitch tracker applies before it will listen to a stream. */
function micStreamIsLive(stream: MediaStream | null | undefined): boolean {
  // On iOS, Pitch Analysis and the games can listen through AVCapture's PCM
  // tap. WebKit's stream is often absent while that native mic is healthy.
  if (isNativeCaptureSessionActive()) return true
  return Boolean(
    stream?.active &&
      stream
        .getAudioTracks()
        .some((track) => track.readyState === 'live' && track.enabled && !track.muted),
  )
}

export function useGameMicRecovery(
  active: boolean,
  onRequestMicStream: GameMicRequest,
  health?: GameMicHealth,
): number {
  const [micEpoch, setMicEpoch] = useState(0)

  const requestRef = useRef(onRequestMicStream)
  requestRef.current = onRequestMicStream
  const activeRef = useRef(active)
  activeRef.current = active
  const permissionPendingRef = useRef(health?.permissionPending ?? false)
  permissionPendingRef.current = health?.permissionPending ?? false
  /** One recovery at a time: foreground and the settled pass both fire. */
  const runningRef = useRef(false)
  const streamRef = health?.streamRef

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

    /*
     * The check starts one miss in: the game asked for the microphone as it
     * opened, so a stream still missing at the first check means that request
     * did not take. After that it wants two misses in a row, because a
     * rebuild under way releases the old stream before it opens the new one.
     */
    let misses = 1
    let healthRecoveries = 0
    let lastHealthRecoveryAt = Number.NEGATIVE_INFINITY

    const checkHealth = () => {
      if (!streamRef || !stillWanted()) return
      if (micStreamIsLive(streamRef.current)) {
        misses = 0
        healthRecoveries = 0
        return
      }
      if (permissionPendingRef.current) {
        misses = 0
        return
      }
      misses += 1
      if (misses < 2 || runningRef.current) return
      if (healthRecoveries >= MAX_HEALTH_RECOVERIES) return
      const now = performance.now()
      if (now - lastHealthRecoveryAt < HEALTH_RECOVERY_FLOOR_MS) return
      lastHealthRecoveryAt = now
      healthRecoveries += 1
      misses = 0
      void recover()
    }

    const handleForeground = (foreground: boolean) => {
      if (!foreground) return
      healthRecoveries = 0
      void recover()
    }
    const handleRecoveryEvent = () => {
      void recover()
    }
    /** A tap on a deaf game is the player noticing: give the check its attempts back. */
    const handlePointerDown = () => {
      if (streamRef && !micStreamIsLive(streamRef.current)) healthRecoveries = 0
    }

    const unsubscribe = subscribeAppForeground(handleForeground)
    window.addEventListener(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, handleRecoveryEvent)
    const healthTimer = streamRef ? window.setInterval(checkHealth, HEALTH_CHECK_MS) : null
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, handleRecoveryEvent)
      if (healthTimer !== null) window.clearInterval(healthTimer)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [active, streamRef])

  return micEpoch
}

import { useCallback, useRef, useState } from 'react'
import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import { getMetronomeDelayAfterReferenceSec } from '../synchronization/metronomePlaybackCompensation'
import type { MultitrackRecordingPhase } from '../types'

export interface CountInClickAnchor {
  /** AudioContext time of the count-in's first click — sample-accurate timeline 0. */
  firstClickCtxTime: number
  /** Same instant on the performance.now() clock (for stamping recording offsets). */
  firstClickPerfMs: number
}

export function useMultitrackRecording(options: {
  /**
   * Fires at count-in start and must actually start the camera. The returned
   * promise resolves true only once recording is confirmed (native
   * didStartRecording) — a false/reject aborts the count-in with an error
   * instead of marching into a dead-end 'recording' phase.
   */
  onCountInStart?: (panelId: string) => Promise<boolean> | boolean | void
  /** Load/prime reference media paused at timeline 0 — must finish before the click begins. */
  onArmPlayback?: () => Promise<void>
  /**
   * Click-anchored reference start: the metronome has just been started and
   * `anchor` pins the exact first-click moment. Start reference takes slaved
   * onto that click grid (plus backing). Resolves true once playback is
   * confirmed or when there is nothing to play.
   */
  onAnchoredReferenceStart?: (anchor: CountInClickAnchor) => Promise<boolean>
  /**
   * Start reference playback WITHOUT a click grid (click disabled). Resolves
   * true once playback is confirmed, or when there is nothing to play.
   */
  onStartReferencePlayback?: () => Promise<boolean>
  /** Prime audio session + metronome graph before count-in (first take / after idle). */
  onPrepareCountInAudio?: () => Promise<boolean>
  onPerformanceStart?: () => Promise<void>
  onCountInComplete?: (panelId: string) => void
  /** Recording failed (start failure or watchdog) — surface to the user; machine has reset to idle. */
  onError?: (message: string) => void
  /** When true, a false from reference start aborts the take. */
  requiresReferencePlayback?: () => boolean
  /** Reset stale arming/count-in after app background — returns whether state was cleared. */
  recoverFromInterrupt?: () => void
}) {
  const {
    onCountInStart,
    onArmPlayback,
    onAnchoredReferenceStart,
    onStartReferencePlayback,
    onPrepareCountInAudio,
    onPerformanceStart,
    onCountInComplete,
    onError,
    requiresReferencePlayback,
    recoverFromInterrupt,
  } = options
  const [phase, setPhase] = useState<MultitrackRecordingPhase>('idle')
  const [targetPanelId, setTargetPanelId] = useState<string | null>(null)
  const [countInRemaining, setCountInRemaining] = useState(0)
  const activeRef = useRef(false)
  const pulseUnsubRef = useRef<(() => void) | null>(null)
  const timerRef = useRef<number | null>(null)
  const trimStartMsRef = useRef<number>(0)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const getTrimStartMs = useCallback(() => trimStartMsRef.current, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearPulseUnsub = useCallback(() => {
    pulseUnsubRef.current?.()
    pulseUnsubRef.current = null
  }, [])

  const cancel = useCallback(() => {
    activeRef.current = false
    clearTimer()
    clearPulseUnsub()
    sharedMetronomeEngine.stop()
    setCountInRemaining(0)
    setPhase('idle')
    setTargetPanelId(null)
  }, [clearPulseUnsub, clearTimer])

  const recover = useCallback(() => {
    if (phase === 'arming' || phase === 'count-in') {
      cancel()
      recoverFromInterrupt?.()
    }
  }, [cancel, phase, recoverFromInterrupt])

  /** Reset to idle AND tell the user why — used for start failures and watchdogs. */
  const fail = useCallback(
    (message: string) => {
      cancel()
      onErrorRef.current?.(message)
    },
    [cancel],
  )

  /**
   * Moves to the review phase after Stop — keeps `targetPanelId` and the
   * active guard (still blocking a new recording) until the user explicitly
   * confirms or retries the just-recorded take via `cancel()`.
   */
  const enterReview = useCallback(() => {
    clearTimer()
    clearPulseUnsub()
    sharedMetronomeEngine.stop()
    setCountInRemaining(0)
    setPhase('review')
  }, [clearPulseUnsub, clearTimer])

  /** Visual-only count-in (click disabled) — setTimeout paced. */
  const runVisualCountIn = useCallback(
    async (countInBeats: number, beatMs: number) => {
      if (countInBeats <= 0) return
      setPhase('count-in')
      await new Promise<void>((resolve) => {
        let beat = countInBeats
        const tick = () => {
          if (!activeRef.current) {
            clearTimer()
            resolve()
            return
          }
          setCountInRemaining(beat)
          beat -= 1
          if (beat <= 0) {
            clearTimer()
            resolve()
            return
          }
          timerRef.current = window.setTimeout(tick, beatMs)
        }
        tick()
      })
    },
    [clearTimer],
  )

  /**
   * Pulse-locked UI countdown — subscribes BEFORE the metronome starts so beat
   * 1 is never missed. Returns a promise that resolves when the count-in
   * completes (or immediately for zero beats).
   */
  const armPulseCountdown = useCallback(
    (countInBeats: number) => {
      if (countInBeats <= 0) return Promise.resolve()
      setPhase('count-in')
      setCountInRemaining(countInBeats)
      return new Promise<void>((resolve) => {
        let beatsLeft = countInBeats
        pulseUnsubRef.current = sharedMetronomeEngine.subscribePulse(() => {
          if (!activeRef.current) {
            clearPulseUnsub()
            resolve()
            return
          }
          setCountInRemaining(beatsLeft)
          beatsLeft -= 1
          if (beatsLeft <= 0) {
            clearPulseUnsub()
            resolve()
          }
        })
      })
    },
    [clearPulseUnsub],
  )

  const beginCountIn = useCallback((panelId: string, settings?: {
    bpm?: number
    countInBars?: number
    clickEnabled?: boolean
  }) => {
    if (activeRef.current) return
    const bpm = Math.max(40, Math.min(300, Math.round(settings?.bpm ?? 120)))
    const countInBars = Math.max(0, Math.min(8, Math.round(settings?.countInBars ?? 1)))
    const countInBeats = countInBars * 4
    const beatMs = 60_000 / bpm
    const clickEnabled = settings?.clickEnabled !== false

    activeRef.current = true
    setTargetPanelId(panelId)
    setCountInRemaining(0)
    setPhase('arming')

    void (async () => {
      trimStartMsRef.current = 0
      sharedMetronomeEngine.stop()

      const startResult = onCountInStart?.(panelId)
      let T_cameraStart = 0
      const cameraPromise = Promise.resolve(startResult ?? true)
        .then((started) => {
          T_cameraStart = performance.now()
          if (started !== false) return true
          if (activeRef.current) fail("Recording couldn't start. Check the camera and try again.")
          return false
        })
        .catch(() => {
          T_cameraStart = performance.now()
          if (activeRef.current) fail("Recording couldn't start. Check the camera and try again.")
          return false
        })

      try {
        await onArmPlayback?.()
      } catch {
        if (activeRef.current) fail("Reference playback couldn't load. Try again.")
        return
      }

      const [cameraOk] = await Promise.all([cameraPromise])
      if (!cameraOk || !activeRef.current) return

      const wantsReference = requiresReferencePlayback?.() === true

      if (clickEnabled) {
        // ── Click-anchored flow (first take AND overdubs) ──────────────────
        // The metronome's first click is the ONLY sample-accurate event in the
        // system, so it defines timeline 0. Start the click grid FIRST, stamp
        // the take's offset from the exact scheduled click time, then chase
        // reference playback onto that grid. This removes every source of
        // variable latency (media spin-up, awaits, native calls) from the
        // recorded timing — the old approach stamped offsets from fuzzy
        // "reference started" wall times, baking a different error into each
        // take, which is why earlier takes drifted late against new count-ins.
        sharedMetronomeEngine.applySectionConfig(
          {
            bpm,
            meter: '4/4',
            subdivision: 'off',
            pulseModeId: 'default',
            accentLevels: ['strong', 'weak', 'weak', 'weak'],
          },
          { resetBeat: true },
        )

        const audioReady = (await onPrepareCountInAudio?.()) ?? true
        if (!audioReady) {
          if (activeRef.current) fail("The metronome couldn't start. Try again.")
          return
        }

        // Lead before click 1: enough time for reference play() to spin up.
        const firstBeatDelaySec = await getMetronomeDelayAfterReferenceSec()
        if (!activeRef.current) return

        const countDone = armPulseCountdown(countInBeats)

        const started = await sharedMetronomeEngine.start({ firstBeatDelaySec })
        if (!started) {
          clearPulseUnsub()
          if (activeRef.current) fail("The metronome couldn't start. Try again.")
          return
        }

        const anchor = sharedMetronomeEngine.getLastStartInfo()
        if (anchor && T_cameraStart > 0) {
          trimStartMsRef.current = Math.max(
            0,
            Math.round(anchor.firstClickPerfMs - T_cameraStart),
          )
        }

        const referenceStarted = anchor
          ? ((await onAnchoredReferenceStart?.(anchor)) ?? true)
          : ((await onStartReferencePlayback?.()) ?? true)
        if (wantsReference && referenceStarted === false) {
          clearPulseUnsub()
          if (activeRef.current) {
            fail("Reference playback couldn't start. Check your takes and try again.")
          }
          return
        }

        await countDone
      } else {
        // ── No click: references define the start (previous behavior) ──────
        const referenceStarted = (await onStartReferencePlayback?.()) ?? true
        const T_audioStart = performance.now()
        if (wantsReference && referenceStarted === false) {
          if (activeRef.current) {
            fail("Reference playback couldn't start. Check your takes and try again.")
          }
          return
        }
        if (T_cameraStart > 0) {
          trimStartMsRef.current = Math.max(0, Math.round(T_audioStart - T_cameraStart))
        }
        await runVisualCountIn(countInBeats, beatMs)
      }
      if (!activeRef.current) return

      await onPerformanceStart?.()
      if (!activeRef.current) return
      setPhase('recording')
      onCountInComplete?.(panelId)
    })()
  }, [
    armPulseCountdown,
    clearPulseUnsub,
    fail,
    onAnchoredReferenceStart,
    onArmPlayback,
    onCountInComplete,
    onCountInStart,
    onPerformanceStart,
    onPrepareCountInAudio,
    onStartReferencePlayback,
    requiresReferencePlayback,
    runVisualCountIn,
  ])

  return {
    phase,
    targetPanelId,
    countInRemaining,
    beginCountIn,
    cancel,
    recover,
    enterReview,
    fail,
    getTrimStartMs,
  }
}

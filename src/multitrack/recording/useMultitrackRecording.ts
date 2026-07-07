import { useCallback, useRef, useState } from 'react'
import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import type { MultitrackRecordingPhase } from '../types'

export function useMultitrackRecording(options: {
  /**
   * Fires at count-in start and must actually start the camera. The returned
   * promise resolves true only once recording is confirmed (native
   * didStartRecording) — a false/reject aborts the count-in with an error
   * instead of marching into a dead-end 'recording' phase.
   */
  onCountInStart?: (panelId: string) => Promise<boolean> | boolean | void
  onPreparePlaybackDuringCountIn?: () => Promise<void>
  onPerformanceStart?: () => Promise<void>
  onCountInComplete?: (panelId: string) => void
  /** Recording failed (start failure or watchdog) — surface to the user; machine has reset to idle. */
  onError?: (message: string) => void
}) {
  const {
    onCountInStart,
    onPreparePlaybackDuringCountIn,
    onPerformanceStart,
    onCountInComplete,
    onError,
  } = options
  const [phase, setPhase] = useState<MultitrackRecordingPhase>('idle')
  const [targetPanelId, setTargetPanelId] = useState<string | null>(null)
  const [countInRemaining, setCountInRemaining] = useState(0)
  const activeRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    activeRef.current = false
    clearTimer()
    sharedMetronomeEngine.stop()
    setCountInRemaining(0)
    setPhase('idle')
    setTargetPanelId(null)
  }, [clearTimer])

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
    sharedMetronomeEngine.stop()
    setCountInRemaining(0)
    setPhase('review')
  }, [clearTimer])

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

    activeRef.current = true
    setTargetPanelId(panelId)
    setCountInRemaining(countInBeats)
    setPhase(countInBeats > 0 ? 'count-in' : 'recording')

    void (async () => {
      // Camera start is issued at beat 1 and settles (~1s) well inside a
      // one-bar count-in. With a 0-bar count-in the performance may begin a
      // beat before didStartRecording confirms — AVFoundation still captures
      // from session start, so nothing is lost; the watchdog in the overlay
      // covers the genuine-failure case.
      const startResult = onCountInStart?.(panelId)
      void Promise.resolve(startResult ?? true)
        .then((started) => {
          if (started !== false) return
          if (!activeRef.current) return
          fail("Recording couldn't start. Check the camera and try again.")
        })
        .catch(() => {
          if (!activeRef.current) return
          fail("Recording couldn't start. Check the camera and try again.")
        })

      void onPreparePlaybackDuringCountIn?.()

      if (settings?.clickEnabled !== false) {
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
        await sharedMetronomeEngine.start()
      }

      for (let beat = countInBeats; beat > 0; beat -= 1) {
        if (!activeRef.current) return
        setCountInRemaining(beat)
        await new Promise((resolve) => {
          timerRef.current = window.setTimeout(resolve, beatMs)
        })
      }

      if (!activeRef.current) return
      setCountInRemaining(0)
      await onPerformanceStart?.()
      if (!activeRef.current) return
      setPhase('recording')
      onCountInComplete?.(panelId)
    })()
  }, [fail, onCountInComplete, onCountInStart, onPerformanceStart, onPreparePlaybackDuringCountIn])

  return { phase, targetPanelId, countInRemaining, beginCountIn, cancel, enterReview, fail }
}

import { useCallback, useRef, useState } from 'react'
import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import {
  beatDurationSec,
  buildTakeTimingMetadata,
  getRecordingBeatSchedule,
  type MultitrackTakeTimingMetadata,
} from '../synchronization/multitrackBeatSchedule'
import type { MultitrackRecordingPhase } from '../types'

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
   * Start Track 1 reference playback on overdub beat 5. Resolves true once
   * playback is confirmed, or when there is nothing to play.
   */
  onStartReferencePlayback?: () => Promise<boolean>
  /** Prime audio session + metronome graph before count-in. */
  onPrepareCountInAudio?: () => Promise<boolean>
  onPerformanceStart?: () => Promise<void>
  onCountInComplete?: (panelId: string) => void
  onError?: (message: string) => void
  requiresReferencePlayback?: () => boolean
  /** Take id on panel a — stored as referenceTrackId for overdub takes. */
  getReferenceTakeId?: () => string | null
  recoverFromInterrupt?: () => void
}) {
  const {
    onCountInStart,
    onArmPlayback,
    onStartReferencePlayback,
    onPrepareCountInAudio,
    onPerformanceStart,
    onCountInComplete,
    onError,
    requiresReferencePlayback,
    getReferenceTakeId,
    recoverFromInterrupt,
  } = options
  const [phase, setPhase] = useState<MultitrackRecordingPhase>('idle')
  const [targetPanelId, setTargetPanelId] = useState<string | null>(null)
  const [countInRemaining, setCountInRemaining] = useState(0)
  const activeRef = useRef(false)
  const pulseUnsubRef = useRef<(() => void) | null>(null)
  const timerRef = useRef<number | null>(null)
  const timingRef = useRef<MultitrackTakeTimingMetadata | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const getRecordingTiming = useCallback(() => timingRef.current, [])

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
    timingRef.current = null
  }, [clearPulseUnsub, clearTimer])

  const recover = useCallback(() => {
    if (phase === 'arming' || phase === 'count-in') {
      cancel()
      recoverFromInterrupt?.()
    }
  }, [cancel, phase, recoverFromInterrupt])

  const fail = useCallback(
    (message: string) => {
      cancel()
      onErrorRef.current?.(message)
    },
    [cancel],
  )

  const enterReview = useCallback(() => {
    clearTimer()
    clearPulseUnsub()
    sharedMetronomeEngine.stop()
    setCountInRemaining(0)
    setPhase('review')
  }, [clearPulseUnsub, clearTimer])

  /** Visual-only count-in (click disabled). Intervals are BPM-derived, not arbitrary. */
  const runVisualBeatCountIn = useCallback(
    async (
      countInBeats: number,
      performanceStartBeat: number,
      referenceStartBeat: number | null,
      beatMs: number,
      onReferenceBeat?: () => Promise<boolean>,
    ) => {
      if (countInBeats <= 0) return
      setPhase('count-in')
      for (let beat = 1; beat < performanceStartBeat; beat += 1) {
        if (!activeRef.current) return
        setCountInRemaining(Math.max(1, countInBeats - beat + 1))
        if (onReferenceBeat && referenceStartBeat !== null && beat === referenceStartBeat) {
          const started = await onReferenceBeat()
          if (requiresReferencePlayback?.() && started === false && activeRef.current) {
            fail("Reference playback couldn't start. Check your takes and try again.")
            return
          }
        }
        await new Promise<void>((resolve) => {
          timerRef.current = window.setTimeout(resolve, beatMs)
        })
      }
    },
    [fail, requiresReferencePlayback],
  )

  /**
   * Pulse-locked count-in tied to the metronome engine. Reference playback
   * (overdub only) starts on beat 5; performance enters on beat 5 (Track 1)
   * or beat 9 (overdub boxes 2–6).
   */
  const runBeatScheduledCountIn = useCallback(
    async (
      countInBeats: number,
      performanceStartBeat: number,
      referenceStartBeat: number | null,
      clickEnabled: boolean,
      onReferenceBeat?: () => Promise<boolean>,
    ) => {
      if (countInBeats <= 0) return

      setPhase('count-in')
      setCountInRemaining(countInBeats)

      const beatMs = beatDurationSec(sharedMetronomeEngine.getSnapshot().bpm) * 1000

      if (!clickEnabled) {
        await runVisualBeatCountIn(
          countInBeats,
          performanceStartBeat,
          referenceStartBeat,
          beatMs,
          referenceStartBeat !== null ? onReferenceBeat : undefined,
        )
        return
      }

      await new Promise<void>((resolve) => {
        let referenceStarted = false

        pulseUnsubRef.current = sharedMetronomeEngine.subscribePulse((beatIndex) => {
          if (!activeRef.current) {
            clearPulseUnsub()
            resolve()
            return
          }

          const beatNumber = beatIndex + 1

          if (beatNumber <= countInBeats) {
            setCountInRemaining(countInBeats - beatNumber + 1)
          }

          if (
            referenceStartBeat !== null &&
            beatNumber === referenceStartBeat &&
            !referenceStarted
          ) {
            referenceStarted = true
            void onReferenceBeat?.().then((started) => {
              if (requiresReferencePlayback?.() && started === false && activeRef.current) {
                fail("Reference playback couldn't start. Check your takes and try again.")
                clearPulseUnsub()
                resolve()
              }
            })
          }

          if (beatNumber === performanceStartBeat) {
            clearPulseUnsub()
            resolve()
          }
        })

        void sharedMetronomeEngine.start().then((started) => {
          if (!started && activeRef.current) {
            fail("The metronome couldn't start. Try again.")
            clearPulseUnsub()
            resolve()
          }
        })
      })
    },
    [clearPulseUnsub, fail, requiresReferencePlayback, runVisualBeatCountIn],
  )

  const beginCountIn = useCallback((panelId: string, settings?: {
    bpm?: number
    countInBars?: number
    clickEnabled?: boolean
  }) => {
    if (activeRef.current) return
    const bpm = Math.max(40, Math.min(300, Math.round(settings?.bpm ?? 120)))
    const clickEnabled = settings?.clickEnabled !== false
    const schedule = getRecordingBeatSchedule(panelId)

    activeRef.current = true
    setTargetPanelId(panelId)
    setCountInRemaining(0)
    setPhase('arming')
    timingRef.current = buildTakeTimingMetadata(panelId, bpm, getReferenceTakeId?.())

    void (async () => {
      sharedMetronomeEngine.stop()

      const startResult = onCountInStart?.(panelId)
      const cameraPromise = Promise.resolve(startResult ?? true)
        .then((started) => {
          if (started !== false) return true
          if (activeRef.current) fail("Recording couldn't start. Check the camera and try again.")
          return false
        })
        .catch(() => {
          if (activeRef.current) fail("Recording couldn't start. Check the camera and try again.")
          return false
        })

      try {
        await onArmPlayback?.()
      } catch {
        if (activeRef.current) fail("Reference playback couldn't load. Try again.")
        return
      }

      const cameraOk = await cameraPromise
      if (!cameraOk || !activeRef.current) return

      if (clickEnabled) {
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
        if (!audioReady && activeRef.current) {
          fail("The metronome couldn't start. Try again.")
          return
        }
      }

      await runBeatScheduledCountIn(
        schedule.countInBeats,
        schedule.performanceStartBeat,
        schedule.referenceStartBeat,
        clickEnabled,
        schedule.referenceStartBeat !== null ? onStartReferencePlayback : undefined,
      )
      if (!activeRef.current) return

      await onPerformanceStart?.()
      if (!activeRef.current) return
      setPhase('recording')
      onCountInComplete?.(panelId)
    })()
  }, [
    fail,
    getReferenceTakeId,
    onArmPlayback,
    onCountInComplete,
    onCountInStart,
    onPerformanceStart,
    onPrepareCountInAudio,
    onStartReferencePlayback,
    runBeatScheduledCountIn,
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
    getRecordingTiming,
  }
}

import { useCallback, useRef, useState } from 'react'
import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import { getAudioHardwareRtl } from '../../utils/nativeCameraTest'
import {
  beatsToMs,
  buildTakeTimingMetadata,
  getRecordingBeatSchedule,
  micStartLeadMs,
  type MultitrackTakeTimingMetadata,
} from '../synchronization/multitrackBeatSchedule'
import type { MultitrackRecordingPhase } from '../types'

export function useMultitrackRecording(options: {
  /** Arm the recording target (exclude panel, refs) — runs on every Record tap. */
  onPrepareRecording?: (panelId: string) => void
  /**
   * Start the microphone / camera roll. Track 1: immediately on Record.
   * Overdub: on session beat 5 (scheduled with RTL lead).
   */
  onStartMicRecording?: () => Promise<boolean> | boolean | void
  /** Load/prime reference media paused at timeline 0 — must finish before the click begins. */
  onArmPlayback?: () => Promise<void>
  /** Start Track 1 reference on overdub session beat 5. */
  onStartReferencePlayback?: () => Promise<boolean>
  /** Prime audio session + metronome graph before count-in. */
  onPrepareCountInAudio?: () => Promise<boolean>
  onPerformanceStart?: () => Promise<void>
  onCountInComplete?: (panelId: string) => void
  onError?: (message: string) => void
  requiresReferencePlayback?: () => boolean
  getReferenceTakeId?: () => string | null
  recoverFromInterrupt?: () => void
}) {
  const {
    onPrepareRecording,
    onStartMicRecording,
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

  const startMic = useCallback(async () => {
    const started = (await onStartMicRecording?.()) ?? true
    if (started === false && activeRef.current) {
      fail("Recording couldn't start. Check the camera and try again.")
      return false
    }
    return true
  }, [fail, onStartMicRecording])

  /** Visual-only count-in (click disabled). Intervals are BPM-derived. */
  const runVisualBeatCountIn = useCallback(
    async (
      schedule: ReturnType<typeof getRecordingBeatSchedule>,
      bpm: number,
      rtlMs: number,
      onReferenceBeat?: () => Promise<boolean>,
    ) => {
      const { countInBeats, micStartBeat, performanceStartBeat, referenceStartBeat } = schedule
      if (countInBeats <= 0) return
      const beatMs = beatsToMs(1, bpm)
      setPhase('count-in')

      for (let beat = 1; beat < performanceStartBeat; beat += 1) {
        if (!activeRef.current) return
        setCountInRemaining(Math.max(1, countInBeats - beat + 1))

        if (schedule.isOverdub && beat === micStartBeat - 1) {
          timerRef.current = window.setTimeout(() => {
            void startMic()
          }, micStartLeadMs(bpm, rtlMs))
        }

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
      setCountInRemaining(0)
    },
    [fail, requiresReferencePlayback, startMic],
  )

  const runBeatScheduledCountIn = useCallback(
    async (
      schedule: ReturnType<typeof getRecordingBeatSchedule>,
      bpm: number,
      rtlMs: number,
      clickEnabled: boolean,
      onReferenceBeat?: () => Promise<boolean>,
    ) => {
      const { countInBeats, micStartBeat, performanceStartBeat, referenceStartBeat } = schedule
      if (countInBeats <= 0) return

      setPhase('count-in')
      setCountInRemaining(countInBeats)

      if (!clickEnabled) {
        await runVisualBeatCountIn(schedule, bpm, rtlMs, onReferenceBeat)
        return
      }

      await new Promise<void>((resolve) => {
        let pulsesHeard = 0
        let micStarted = false
        let referenceStarted = false

        const scheduleMicOnBeat = () => {
          if (micStarted || micStartBeat <= 1) return
          micStarted = true
          const leadMs = micStartLeadMs(bpm, rtlMs)
          timerRef.current = window.setTimeout(() => {
            void startMic().then((ok) => {
              if (!ok && activeRef.current) {
                clearPulseUnsub()
                resolve()
              }
            })
          }, leadMs)
        }

        pulseUnsubRef.current = sharedMetronomeEngine.subscribePulse(() => {
          if (!activeRef.current) {
            clearPulseUnsub()
            resolve()
            return
          }

          pulsesHeard += 1

          if (pulsesHeard <= countInBeats) {
            setCountInRemaining(countInBeats - pulsesHeard + 1)
          } else {
            setCountInRemaining(0)
          }

          if (micStartBeat > 1 && pulsesHeard === micStartBeat - 1) {
            scheduleMicOnBeat()
          }

          if (
            referenceStartBeat !== null &&
            pulsesHeard === referenceStartBeat &&
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

          if (pulsesHeard === performanceStartBeat) {
            setCountInRemaining(0)
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
    [clearPulseUnsub, fail, requiresReferencePlayback, runVisualBeatCountIn, startMic],
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

    void (async () => {
      sharedMetronomeEngine.stop()
      onPrepareRecording?.(panelId)

      const rtlMs = await getAudioHardwareRtl()
      timingRef.current = buildTakeTimingMetadata(panelId, bpm, getReferenceTakeId?.(), rtlMs)

      // Track 1: mic rolls from the instant Record is tapped (captures all 4 counts).
      if (!schedule.isOverdub) {
        const micOk = await startMic()
        if (!micOk || !activeRef.current) return
      }

      try {
        await onArmPlayback?.()
      } catch {
        if (activeRef.current) fail("Reference playback couldn't load. Try again.")
        return
      }

      if (!activeRef.current) return

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
        schedule,
        bpm,
        rtlMs,
        clickEnabled,
        schedule.referenceStartBeat !== null ? onStartReferencePlayback : undefined,
      )
      if (!activeRef.current) return

      setCountInRemaining(0)
      setPhase('recording')
      await onPerformanceStart?.()
      if (!activeRef.current) return
      onCountInComplete?.(panelId)
    })()
  }, [
    fail,
    getReferenceTakeId,
    onArmPlayback,
    onCountInComplete,
    onPerformanceStart,
    onPrepareCountInAudio,
    onPrepareRecording,
    onStartReferencePlayback,
    runBeatScheduledCountIn,
    startMic,
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

import { useCallback, useRef, useState } from 'react'
import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import { getMetronomeCountInDelaySec } from '../synchronization/metronomePlaybackCompensation'
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
   * Start reference playback (other takes + backing). Resolves true once
   * playback is confirmed, or when there is nothing to play.
   */
  onStartReferencePlayback?: () => Promise<boolean>
  /** Prime audio session + metronome graph before count-in (first take / after idle). */
  onPrepareCountInAudio?: () => Promise<boolean>
  onPerformanceStart?: () => Promise<void>
  onCountInComplete?: (panelId: string) => void
  onError?: (message: string) => void
  requiresReferencePlayback?: () => boolean
  /** Other takes and/or backing will play before count-in — uses full latency delay. */
  hasAudibleReferences?: () => boolean
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
    hasAudibleReferences,
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

  /** Visual-only count-in (click disabled). Shows N … 2 … 1, one full beat on 1. */
  const runVisualCountIn = useCallback(
    async (countInBeats: number, beatMs: number) => {
      if (countInBeats <= 0) return
      setPhase('count-in')
      for (let beat = countInBeats; beat >= 1; beat -= 1) {
        if (!activeRef.current) return
        setCountInRemaining(beat)
        await new Promise<void>((resolve) => {
          timerRef.current = window.setTimeout(resolve, beatMs)
        })
      }
    },
    [],
  )

  /** Pulse-locked count-in (all boxes). Subscribe before start so beat 1 is never missed. */
  const runCountIn = useCallback(
    async (
      countInBeats: number,
      beatMs: number,
      clickEnabled: boolean,
      firstBeatDelaySec: number | undefined,
    ) => {
      if (countInBeats <= 0) return

      setPhase('count-in')
      setCountInRemaining(countInBeats)

      if (!clickEnabled) {
        await runVisualCountIn(countInBeats, beatMs)
        return
      }

      await new Promise<void>((resolve) => {
        let pulsesHeard = 0
        pulseUnsubRef.current = sharedMetronomeEngine.subscribePulse(() => {
          if (!activeRef.current) {
            clearPulseUnsub()
            resolve()
            return
          }
          pulsesHeard += 1
          const remaining = countInBeats - pulsesHeard + 1
          if (remaining > 0) {
            setCountInRemaining(remaining)
          }
          if (pulsesHeard > countInBeats) {
            clearPulseUnsub()
            resolve()
          }
        })

        void sharedMetronomeEngine.start({ firstBeatDelaySec }).then((started) => {
          if (!started && activeRef.current) {
            fail("The metronome couldn't start. Try again.")
            clearPulseUnsub()
            resolve()
          }
        })
      })
    },
    [clearPulseUnsub, fail, runVisualCountIn],
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

      // Start references first, then stamp how far into the file the camera
      // already rolled — this is what Play All / export use to line up takes.
      let T_audioStart = 0
      const referenceStarted = (await onStartReferencePlayback?.()) ?? true
      T_audioStart = performance.now()

      if (requiresReferencePlayback?.() && referenceStarted === false) {
        if (activeRef.current) {
          fail("Reference playback couldn't start. Check your takes and try again.")
        }
        return
      }

      if (T_cameraStart > 0 && T_audioStart > 0) {
        trimStartMsRef.current = Math.max(0, Math.round(T_audioStart - T_cameraStart))
      }

      const audibleReferences =
        hasAudibleReferences?.() ??
        (requiresReferencePlayback?.() === true && referenceStarted)

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
        const firstBeatDelaySec = await getMetronomeCountInDelaySec({
          hasAudibleReferences: audibleReferences,
        })
        await runCountIn(countInBeats, beatMs, clickEnabled, firstBeatDelaySec)
      } else {
        await runVisualCountIn(countInBeats, beatMs)
      }
      if (!activeRef.current) return

      await onPerformanceStart?.()
      if (!activeRef.current) return
      setPhase('recording')
      onCountInComplete?.(panelId)
    })()
  }, [
    fail,
    onArmPlayback,
    onCountInComplete,
    onCountInStart,
    onPerformanceStart,
    onPrepareCountInAudio,
    onStartReferencePlayback,
    requiresReferencePlayback,
    hasAudibleReferences,
    runCountIn,
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

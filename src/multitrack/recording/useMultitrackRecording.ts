import { useCallback, useRef, useState } from 'react'
import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import type { MultitrackRecordingPhase } from '../types'

function recordingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

export interface MultitrackTransportStart {
  firstClickEpochMs: number
  performanceEpochMs: number
  countInBeats: number
  beatDurationSec: number
}

export interface MultitrackTakeTimingMetadata {
  recordingBpm: number
  performanceStartBeat: number
  /** Fallback estimate; native capture replaces this with a measured source-in. */
  timelineOffsetMs: number
}

/**
 * Recording lifecycle for multitrack.
 *
 * The order is intentionally strict:
 *   1. prepare every monitor source and the output route,
 *   2. start capture and await native confirmation,
 *   3. schedule click + monitor audio on the native transport,
 *   4. animate the count-in from the returned timestamps.
 *
 * UI timers never start audible media and therefore cannot change alignment.
 */
export function useMultitrackRecording(options: {
  onPrepareRecording?: (panelId: string) => void
  onArmPlayback?: (panelId: string) => Promise<boolean | void>
  onStartMicRecording?: () => Promise<boolean> | boolean | void
  /** Stops/discards capture when transport setup fails after the camera already started. */
  onAbortMicRecording?: () => void
  onStartTransport?: (settings: {
    bpm: number
    countInBars: number
    clickEnabled: boolean
  }) => Promise<MultitrackTransportStart | null>
  /** Gives non-native monitor sources the exact scheduled performance anchor. */
  onTransportScheduled?: (transport: MultitrackTransportStart) => Promise<void> | void
  onStopTransport?: () => void
  onPerformanceStart?: () => Promise<void>
  onCountInComplete?: (panelId: string) => void
  onError?: (message: string) => void
  recoverFromInterrupt?: () => void
}) {
  const {
    onPrepareRecording,
    onArmPlayback,
    onStartMicRecording,
    onAbortMicRecording,
    onStartTransport,
    onTransportScheduled,
    onStopTransport,
    onPerformanceStart,
    onCountInComplete,
    onError,
    recoverFromInterrupt,
  } = options
  const [phase, setPhase] = useState<MultitrackRecordingPhase>('idle')
  const [targetPanelId, setTargetPanelId] = useState<string | null>(null)
  const [countInRemaining, setCountInRemaining] = useState(0)
  const activeRef = useRef(false)
  const captureActiveRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const countdownIntervalRef = useRef<number | null>(null)
  const timingRef = useRef<MultitrackTakeTimingMetadata | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const getRecordingTiming = useCallback(() => timingRef.current, [])

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    activeRef.current = false
    if (captureActiveRef.current) {
      captureActiveRef.current = false
      onAbortMicRecording?.()
    }
    clearTimers()
    sharedMetronomeEngine.stop()
    onStopTransport?.()
    setCountInRemaining(0)
    setPhase('idle')
    setTargetPanelId(null)
    timingRef.current = null
  }, [clearTimers, onAbortMicRecording, onStopTransport])

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
    activeRef.current = false
    captureActiveRef.current = false
    clearTimers()
    sharedMetronomeEngine.stop()
    onStopTransport?.()
    setCountInRemaining(0)
    setPhase('review')
  }, [clearTimers, onStopTransport])

  const waitUntil = useCallback(async (epochMs: number) => {
    const delayMs = Math.max(0, epochMs - Date.now())
    if (delayMs <= 0) return
    await new Promise<void>((resolve) => {
      timerRef.current = window.setTimeout(resolve, delayMs)
    })
  }, [])

  const beginCountIn = useCallback((panelId: string, settings?: {
    bpm?: number
    countInBars?: number
    clickEnabled?: boolean
  }) => {
    if (activeRef.current) return
    const bpm = Math.max(40, Math.min(300, Math.round(settings?.bpm ?? 120)))
    const countInBars = Math.max(0, Math.min(8, Math.round(settings?.countInBars ?? 1)))
    const clickEnabled = settings?.clickEnabled !== false

    activeRef.current = true
    setTargetPanelId(panelId)
    setCountInRemaining(0)
    setPhase('arming')

    void (async () => {
      sharedMetronomeEngine.stop()
      onPrepareRecording?.(panelId)

      let armed = true
      let armError: unknown = null
      try {
        armed = (await onArmPlayback?.(panelId)) !== false
      } catch (error) {
        armError = error
        armed = false
      }
      if (!activeRef.current) {
        // Arming may finish after the user closed/cancelled. Tear down anything
        // the asynchronous native prepare completed in the meantime.
        sharedMetronomeEngine.stop()
        onStopTransport?.()
        return
      }
      if (!armed) {
        if (activeRef.current) {
          fail(recordingErrorMessage(
            armError,
            "The monitor mix couldn't load. Check your takes and try again.",
          ))
        }
        return
      }

      // Capture is confirmed before the native transport receives its future
      // start anchor. Recorder startup latency can no longer consume count-in.
      const micStarted = (await onStartMicRecording?.()) ?? true
      if (micStarted !== false) captureActiveRef.current = true
      if (micStarted !== false && !activeRef.current) {
        captureActiveRef.current = false
        onAbortMicRecording?.()
        return
      }
      if (micStarted === false) {
        if (activeRef.current) fail("Recording couldn't start. Check the camera and try again.")
        return
      }

      let transport: MultitrackTransportStart | null = null
      let transportError: unknown = null
      try {
        transport = await onStartTransport?.({ bpm, countInBars, clickEnabled }) ?? null
      } catch (error) {
        transportError = error
        transport = null
      }
      if (!transport || !activeRef.current) {
        if (activeRef.current) {
          fail(recordingErrorMessage(
            transportError,
            "The synchronized monitor couldn't start. Try again.",
          ))
        }
        return
      }

      const beatMs = Math.max(1, transport.beatDurationSec * 1000)
      const estimatedSourceInMs = Math.max(0, transport.performanceEpochMs - Date.now())
      timingRef.current = {
        recordingBpm: bpm,
        performanceStartBeat: transport.countInBeats + 1,
        timelineOffsetMs: Math.round(estimatedSourceInMs),
      }

      try {
        await onTransportScheduled?.(transport)
      } catch (error) {
        console.warn('[MultitrackRecording] auxiliary monitor scheduling failed', error)
      }

      if (transport.countInBeats > 0) {
        setPhase('count-in')
        const updateCountdown = () => {
          const remainingMs = Math.max(0, transport!.performanceEpochMs - Date.now())
          setCountInRemaining(Math.min(
            transport!.countInBeats,
            Math.max(0, Math.ceil(remainingMs / beatMs)),
          ))
        }
        updateCountdown()
        countdownIntervalRef.current = window.setInterval(updateCountdown, 40)
      }

      await waitUntil(transport.performanceEpochMs)
      if (!activeRef.current) return

      if (countdownIntervalRef.current !== null) {
        window.clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
      setCountInRemaining(0)
      setPhase('recording')
      try {
        await onPerformanceStart?.()
      } catch {
        if (activeRef.current) fail("The monitor mix couldn't begin. Try again.")
        return
      }
      if (!activeRef.current) return
      onCountInComplete?.(panelId)
    })()
  }, [fail, onAbortMicRecording, onArmPlayback, onCountInComplete, onPerformanceStart, onPrepareRecording, onStartMicRecording, onStartTransport, onStopTransport, onTransportScheduled, waitUntil])

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

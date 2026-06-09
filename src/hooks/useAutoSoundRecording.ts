import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { RecordingMode } from '../types'
import { readAnalyserLevel } from '../utils/audioLevel'
import { volumeThresholdToLevel } from '../utils/appSettings'

const POLL_INTERVAL_MS = 8
const MIN_RECORDING_MS = 400
const COOLDOWN_MS = 250

interface UseAutoSoundRecordingOptions {
  enabled: boolean
  monitoringAllowed: boolean
  recordingMode: RecordingMode
  ready: boolean
  isRecording: boolean
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  silenceMs: number
  volumeThreshold: number
  startRecording: () => void
  stopRecording: () => void
  warmRecorder: () => void
  disarmRecorder: () => void
  onAutoRecordingFinished: () => void
}

export function useAutoSoundRecording({
  enabled,
  monitoringAllowed,
  recordingMode,
  ready,
  isRecording,
  streamRef,
  streamGeneration,
  silenceMs,
  volumeThreshold,
  startRecording,
  stopRecording,
  warmRecorder,
  disarmRecorder,
  onAutoRecordingFinished,
}: UseAutoSoundRecordingOptions) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const silenceSinceRef = useRef<number | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const autoTriggeredRef = useRef(false)
  const cooldownUntilRef = useRef(0)
  const isRecordingRef = useRef(isRecording)
  const startRecordingRef = useRef(startRecording)
  const stopRecordingRef = useRef(stopRecording)
  const warmRecorderRef = useRef(warmRecorder)
  const disarmRecorderRef = useRef(disarmRecorder)
  const onFinishedRef = useRef(onAutoRecordingFinished)
  const gateRef = useRef(volumeThresholdToLevel(volumeThreshold))
  const silenceMsRef = useRef(silenceMs)
  const wasRecordingRef = useRef(isRecording)

  isRecordingRef.current = isRecording
  startRecordingRef.current = startRecording
  stopRecordingRef.current = stopRecording
  warmRecorderRef.current = warmRecorder
  disarmRecorderRef.current = disarmRecorder
  onFinishedRef.current = onAutoRecordingFinished
  gateRef.current = volumeThresholdToLevel(volumeThreshold)
  silenceMsRef.current = silenceMs

  const shouldMonitor =
    enabled && monitoringAllowed && recordingMode === 'audio' && ready

  const teardownMonitor = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }

    try {
      sourceRef.current?.disconnect()
    } catch {
      /* ignore */
    }
    sourceRef.current = null
    analyserRef.current = null

    const ctx = audioContextRef.current
    audioContextRef.current = null
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {})
    }

    silenceSinceRef.current = null
    recordingStartedAtRef.current = null
    autoTriggeredRef.current = false
    void disarmRecorderRef.current()
  }

  useLayoutEffect(() => {
    if (shouldMonitor) return
    teardownMonitor()
  }, [shouldMonitor])

  useEffect(() => {
    if (wasRecordingRef.current && !isRecording && shouldMonitor) {
      void warmRecorderRef.current()
    }
    wasRecordingRef.current = isRecording
  }, [isRecording, shouldMonitor])

  useEffect(() => {
    if (!shouldMonitor) return

    const stream = streamRef.current
    if (!stream || stream.getAudioTracks().every((track) => track.readyState !== 'live')) {
      return
    }

    let cancelled = false

    const setup = async () => {
      teardownMonitor()

      const audioContext = new AudioContext()
      if (cancelled) {
        await audioContext.close().catch(() => {})
        return
      }

      if (audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => {})
      }

      if (cancelled) {
        await audioContext.close().catch(() => {})
        return
      }

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source

      void warmRecorderRef.current()

      const tick = () => {
        if (cancelled || !analyserRef.current) return

        const now = performance.now()
        if (now < cooldownUntilRef.current) return

        if (audioContextRef.current?.state === 'suspended') {
          void audioContextRef.current.resume().catch(() => {})
        }

        const level = readAnalyserLevel(analyserRef.current)
        const aboveGate = level >= gateRef.current

        if (!isRecordingRef.current) {
          silenceSinceRef.current = null
          recordingStartedAtRef.current = null

          if (aboveGate) {
            autoTriggeredRef.current = true
            startRecordingRef.current()
          }

          return
        }

        if (!autoTriggeredRef.current) return

        if (recordingStartedAtRef.current === null) {
          recordingStartedAtRef.current = now
        }

        const recordingDuration = now - recordingStartedAtRef.current

        if (aboveGate) {
          silenceSinceRef.current = null
        } else if (recordingDuration >= MIN_RECORDING_MS) {
          if (silenceSinceRef.current === null) {
            silenceSinceRef.current = now
          } else if (now - silenceSinceRef.current >= silenceMsRef.current) {
            onFinishedRef.current()
            autoTriggeredRef.current = false
            recordingStartedAtRef.current = null
            silenceSinceRef.current = null
            cooldownUntilRef.current = now + COOLDOWN_MS
            stopRecordingRef.current()
          }
        }
      }

      pollTimerRef.current = window.setInterval(tick, POLL_INTERVAL_MS)
    }

    void setup()

    return () => {
      cancelled = true
      teardownMonitor()
    }
  }, [shouldMonitor, streamGeneration, streamRef])

  return { teardownMonitor }
}

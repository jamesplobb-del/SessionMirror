import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { RecordingMode } from '../types'
import { readAnalyserRms } from '../utils/audioLevel'
import { volumeThresholdToLevel } from '../utils/appSettings'

const START_HOLD_MS = 120
const MIN_RECORDING_MS = 400
const COOLDOWN_MS = 600

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
  onAutoRecordingFinished,
}: UseAutoSoundRecordingOptions) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const loudSinceRef = useRef<number | null>(null)
  const silenceSinceRef = useRef<number | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const autoTriggeredRef = useRef(false)
  const cooldownUntilRef = useRef(0)
  const isRecordingRef = useRef(isRecording)
  const startRecordingRef = useRef(startRecording)
  const stopRecordingRef = useRef(stopRecording)
  const onFinishedRef = useRef(onAutoRecordingFinished)
  const gateRef = useRef(volumeThresholdToLevel(volumeThreshold))
  const silenceMsRef = useRef(silenceMs)

  isRecordingRef.current = isRecording
  startRecordingRef.current = startRecording
  stopRecordingRef.current = stopRecording
  onFinishedRef.current = onAutoRecordingFinished
  gateRef.current = volumeThresholdToLevel(volumeThreshold)
  silenceMsRef.current = silenceMs

  const shouldMonitor =
    enabled && monitoringAllowed && recordingMode === 'audio' && ready

  const teardownMonitor = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
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

    loudSinceRef.current = null
    silenceSinceRef.current = null
    recordingStartedAtRef.current = null
    autoTriggeredRef.current = false
  }

  useLayoutEffect(() => {
    if (shouldMonitor) return
    teardownMonitor()
  }, [shouldMonitor])

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
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.35

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source

      const tick = () => {
        if (cancelled || !analyserRef.current) return

        const now = performance.now()
        if (now < cooldownUntilRef.current) {
          rafRef.current = window.requestAnimationFrame(tick)
          return
        }

        if (audioContextRef.current?.state === 'suspended') {
          void audioContextRef.current.resume().catch(() => {})
        }

        const level = readAnalyserRms(analyserRef.current)
        const aboveGate = level >= gateRef.current

        if (!isRecordingRef.current) {
          silenceSinceRef.current = null
          recordingStartedAtRef.current = null

          if (aboveGate) {
            if (loudSinceRef.current === null) {
              loudSinceRef.current = now
            } else if (now - loudSinceRef.current >= START_HOLD_MS) {
              autoTriggeredRef.current = true
              loudSinceRef.current = null
              startRecordingRef.current()
            }
          } else {
            loudSinceRef.current = null
          }

          rafRef.current = window.requestAnimationFrame(tick)
          return
        }

        loudSinceRef.current = null

        if (!autoTriggeredRef.current) {
          rafRef.current = window.requestAnimationFrame(tick)
          return
        }

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

        rafRef.current = window.requestAnimationFrame(tick)
      }

      rafRef.current = window.requestAnimationFrame(tick)
    }

    void setup()

    return () => {
      cancelled = true
      teardownMonitor()
    }
  }, [shouldMonitor, streamGeneration, streamRef])

  return { teardownMonitor }
}

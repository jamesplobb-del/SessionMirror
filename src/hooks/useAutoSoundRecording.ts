import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { RecordingMode } from '../types'
import { combinedGateLevel, readAnalyserMetrics } from '../utils/audioLevel'
import { getAutoRecordProfile, type AutoRecordProfile } from '../utils/appSettings'

const POLL_INTERVAL_MS = 4
const MIN_RECORDING_MS = 400
const COOLDOWN_MS = 350
const MONITOR_WARMUP_MS = 450
const START_LATCH_MS = 3000
const WARM_RETRY_MS = 600
const QUIET_EMA_ALPHA = 0.04

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

function computeEffectiveGate(profile: AutoRecordProfile, quietRmsEma: number): number {
  const ambientGate =
    quietRmsEma > 0
      ? quietRmsEma * profile.noiseHeadroom + profile.noiseMargin
      : profile.gate
  return Math.max(profile.gate, ambientGate)
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
  const sampleBufferRef = useRef<Float32Array | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const warmRetryTimerRef = useRef<number | null>(null)
  const silenceSinceRef = useRef<number | null>(null)
  const loudSinceRef = useRef<number | null>(null)
  const attackSinceRef = useRef<number | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const autoTriggeredRef = useRef(false)
  const startLatchRef = useRef(false)
  const monitorWarmUntilRef = useRef(0)
  const startLatchTimerRef = useRef<number | null>(null)
  const cooldownUntilRef = useRef(0)
  const quietRmsEmaRef = useRef(0)
  const effectiveGateRef = useRef(0)
  const isRecordingRef = useRef(isRecording)
  const startRecordingRef = useRef(startRecording)
  const stopRecordingRef = useRef(stopRecording)
  const warmRecorderRef = useRef(warmRecorder)
  const disarmRecorderRef = useRef(disarmRecorder)
  const onFinishedRef = useRef(onAutoRecordingFinished)
  const profileRef = useRef(getAutoRecordProfile(volumeThreshold))
  const silenceMsRef = useRef(silenceMs)
  const wasRecordingRef = useRef(isRecording)

  isRecordingRef.current = isRecording
  startRecordingRef.current = startRecording
  stopRecordingRef.current = stopRecording
  warmRecorderRef.current = warmRecorder
  disarmRecorderRef.current = disarmRecorder
  onFinishedRef.current = onAutoRecordingFinished
  profileRef.current = getAutoRecordProfile(volumeThreshold)
  silenceMsRef.current = silenceMs
  effectiveGateRef.current = computeEffectiveGate(
    profileRef.current,
    quietRmsEmaRef.current,
  )

  const shouldMonitor =
    enabled && monitoringAllowed && recordingMode === 'audio' && ready

  const clearStartLatch = () => {
    startLatchRef.current = false
    if (startLatchTimerRef.current !== null) {
      window.clearTimeout(startLatchTimerRef.current)
      startLatchTimerRef.current = null
    }
  }

  const armStartLatch = () => {
    clearStartLatch()
    startLatchRef.current = true
    startLatchTimerRef.current = window.setTimeout(() => {
      startLatchRef.current = false
      startLatchTimerRef.current = null
      void warmRecorderRef.current()
    }, START_LATCH_MS)
  }

  const triggerAutoStart = () => {
    if (startLatchRef.current || isRecordingRef.current) return
    autoTriggeredRef.current = true
    loudSinceRef.current = null
    attackSinceRef.current = null
    armStartLatch()
    startRecordingRef.current()
  }

  const teardownMonitor = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }

    if (warmRetryTimerRef.current !== null) {
      window.clearInterval(warmRetryTimerRef.current)
      warmRetryTimerRef.current = null
    }

    clearStartLatch()

    try {
      sourceRef.current?.disconnect()
    } catch {
      /* ignore */
    }
    sourceRef.current = null
    analyserRef.current = null
    sampleBufferRef.current = null

    const ctx = audioContextRef.current
    audioContextRef.current = null
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {})
    }

    silenceSinceRef.current = null
    loudSinceRef.current = null
    attackSinceRef.current = null
    recordingStartedAtRef.current = null
    autoTriggeredRef.current = false
    monitorWarmUntilRef.current = 0
    quietRmsEmaRef.current = 0
    effectiveGateRef.current = profileRef.current.gate
    void disarmRecorderRef.current()
  }

  useLayoutEffect(() => {
    if (shouldMonitor) return
    teardownMonitor()
  }, [shouldMonitor])

  useEffect(() => {
    if (isRecording) {
      clearStartLatch()
      return
    }

    if (wasRecordingRef.current && shouldMonitor) {
      autoTriggeredRef.current = false
      clearStartLatch()
      loudSinceRef.current = null
      attackSinceRef.current = null
      cooldownUntilRef.current = performance.now() + COOLDOWN_MS
      window.setTimeout(() => {
        void warmRecorderRef.current()
      }, 200)
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
    const calibrationSamples: number[] = []

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
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source
      sampleBufferRef.current = new Float32Array(analyser.fftSize)

      monitorWarmUntilRef.current = performance.now() + MONITOR_WARMUP_MS

      const tick = () => {
        if (cancelled || !analyserRef.current || !sampleBufferRef.current) return

        const now = performance.now()
        if (now < cooldownUntilRef.current) return

        const ctx = audioContextRef.current
        if (ctx?.state === 'suspended') {
          void ctx.resume().catch(() => {})
        }

        const profile = profileRef.current
        const metrics = readAnalyserMetrics(analyserRef.current, sampleBufferRef.current)
        const gateLevel = profile.usePeak
          ? combinedGateLevel(metrics)
          : metrics.rms
        const stopLevel = combinedGateLevel(metrics, 0.35)
        const effectiveGate = effectiveGateRef.current

        if (now < monitorWarmUntilRef.current) {
          calibrationSamples.push(metrics.rms)
          loudSinceRef.current = null
          attackSinceRef.current = null
          return
        }

        if (calibrationSamples.length > 0) {
          calibrationSamples.sort((a, b) => a - b)
          const index = Math.min(
            calibrationSamples.length - 1,
            Math.floor(calibrationSamples.length * 0.85),
          )
          quietRmsEmaRef.current = calibrationSamples[index] ?? metrics.rms
          calibrationSamples.length = 0
          effectiveGateRef.current = computeEffectiveGate(profile, quietRmsEmaRef.current)
          void warmRecorderRef.current()
        }

        if (!isRecordingRef.current) {
          silenceSinceRef.current = null
          recordingStartedAtRef.current = null

          if (metrics.rms < effectiveGate * 0.85) {
            quietRmsEmaRef.current =
              quietRmsEmaRef.current === 0
                ? metrics.rms
                : quietRmsEmaRef.current * (1 - QUIET_EMA_ALPHA) +
                  metrics.rms * QUIET_EMA_ALPHA
            effectiveGateRef.current = computeEffectiveGate(
              profile,
              quietRmsEmaRef.current,
            )
          }

          const currentGate = effectiveGateRef.current
          const aboveGate = gateLevel >= currentGate

          const attackEligible =
            profile.attackHoldMs > 0 &&
            profile.attackPeakRatio > 0 &&
            metrics.peak >= currentGate * profile.attackPeakRatio

          if (attackEligible) {
            if (attackSinceRef.current === null) {
              attackSinceRef.current = now
            } else if (
              now - attackSinceRef.current >= profile.attackHoldMs &&
              !startLatchRef.current
            ) {
              triggerAutoStart()
              return
            }
            loudSinceRef.current = null
          } else {
            attackSinceRef.current = null

            if (aboveGate) {
              if (loudSinceRef.current === null) {
                loudSinceRef.current = now
              } else if (
                now - loudSinceRef.current >= profile.holdMs &&
                !startLatchRef.current
              ) {
                triggerAutoStart()
                return
              }
            } else {
              loudSinceRef.current = null
            }
          }

          return
        }

        loudSinceRef.current = null
        attackSinceRef.current = null

        if (!autoTriggeredRef.current) return

        if (recordingStartedAtRef.current === null) {
          recordingStartedAtRef.current = now
        }

        const recordingDuration = now - recordingStartedAtRef.current

        if (stopLevel >= effectiveGateRef.current * 0.72) {
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

      warmRetryTimerRef.current = window.setInterval(() => {
        if (cancelled || isRecordingRef.current || startLatchRef.current) return
        void warmRecorderRef.current()
      }, WARM_RETRY_MS)
    }

    void setup()

    return () => {
      cancelled = true
      teardownMonitor()
    }
  }, [shouldMonitor, streamGeneration, streamRef])

  return { teardownMonitor }
}

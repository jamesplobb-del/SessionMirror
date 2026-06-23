import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { RecordingMode } from '../types'
import { combinedGateLevel, readAnalyserMetrics } from '../utils/audioLevel'
import { getAutoRecordProfile, type AutoRecordProfile } from '../utils/appSettings'

const POLL_INTERVAL_MS = 32
const MIN_RECORDING_MS = 400
const COOLDOWN_MS = 180
const MONITOR_WARMUP_MS = 280
const POST_PLAYBACK_WARMUP_MS = 900
const START_LATCH_MS = 1200
const WARM_RETRY_MS = 800
const HEALTH_CHECK_MS = 2500
const STALL_RECOVERY_MS = 2200
const START_FAILURE_CLEAR_MS = 1200
const QUIET_EMA_ALPHA = 0.03

interface UseAutoSoundRecordingOptions {
  enabled: boolean
  monitoringAllowed: boolean
  /** Block new auto-starts (e.g. while take is playing back through speakers). */
  suppressStart: boolean
  /** Tear down mic analyser while takes play so iOS does not duck speaker output. */
  monitoringPaused?: boolean
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
  onMonitorStalled?: () => void
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * ratio),
  )
  return sorted[index] ?? 0
}

function computeEffectiveGate(profile: AutoRecordProfile, quietRms: number): number {
  if (quietRms <= 0) return profile.gate

  const ambientGate = quietRms * profile.noiseHeadroom + profile.noiseMargin
  const merged = Math.max(profile.gate, ambientGate)
  const cap = profile.gate * profile.gateCapMultiplier
  return Math.min(merged, cap)
}

function isStreamAudioLive(stream: MediaStream | null): boolean {
  return Boolean(
    stream?.getAudioTracks().some(
      (track) => track.readyState === 'live' && track.enabled,
    ),
  )
}

export function useAutoSoundRecording({
  enabled,
  monitoringAllowed,
  suppressStart,
  monitoringPaused = false,
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
  onMonitorStalled,
}: UseAutoSoundRecordingOptions) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const sampleBufferRef = useRef<Float32Array | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const warmRetryTimerRef = useRef<number | null>(null)
  const healthTimerRef = useRef<number | null>(null)
  const startFailureTimerRef = useRef<number | null>(null)
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
  const lastTickAtRef = useRef(0)
  const [monitorEpoch, setMonitorEpoch] = useState(0)
  const [handsFreeRecording, setHandsFreeRecording] = useState(false)
  const suppressStartRef = useRef(suppressStart)
  const isRecordingRef = useRef(isRecording)
  const startRecordingRef = useRef(startRecording)
  const stopRecordingRef = useRef(stopRecording)
  const warmRecorderRef = useRef(warmRecorder)
  const disarmRecorderRef = useRef(disarmRecorder)
  const onFinishedRef = useRef(onAutoRecordingFinished)
  const onMonitorStalledRef = useRef(onMonitorStalled)
  const profileRef = useRef(getAutoRecordProfile(volumeThreshold))
  const silenceMsRef = useRef(silenceMs)
  const wasRecordingRef = useRef(isRecording)
  const appliedVolumeThresholdRef = useRef(volumeThreshold)
  const prevSuppressStartRef = useRef(suppressStart)
  const prevMonitoringPausedRef = useRef(monitoringPaused)

  isRecordingRef.current = isRecording
  suppressStartRef.current = suppressStart
  startRecordingRef.current = startRecording
  stopRecordingRef.current = stopRecording
  warmRecorderRef.current = warmRecorder
  disarmRecorderRef.current = disarmRecorder
  onFinishedRef.current = onAutoRecordingFinished
  onMonitorStalledRef.current = onMonitorStalled
  profileRef.current = getAutoRecordProfile(volumeThreshold)
  silenceMsRef.current = silenceMs
  effectiveGateRef.current = computeEffectiveGate(
    profileRef.current,
    quietRmsEmaRef.current,
  )

  const shouldMonitor =
    enabled && monitoringAllowed && recordingMode === 'audio' && ready && !monitoringPaused

  const clearStartFailureTimer = () => {
    if (startFailureTimerRef.current !== null) {
      window.clearTimeout(startFailureTimerRef.current)
      startFailureTimerRef.current = null
    }
  }

  const clearStartLatch = () => {
    clearStartFailureTimer()
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

  const scheduleStartFailureRecovery = () => {
    clearStartFailureTimer()
    startFailureTimerRef.current = window.setTimeout(() => {
      startFailureTimerRef.current = null
      if (!isRecordingRef.current) {
        autoTriggeredRef.current = false
        clearStartLatch()
        void warmRecorderRef.current()
      }
    }, START_FAILURE_CLEAR_MS)
  }

  const triggerAutoStart = () => {
    if (
      startLatchRef.current ||
      isRecordingRef.current ||
      suppressStartRef.current
    ) {
      return
    }

    autoTriggeredRef.current = true
    setHandsFreeRecording(true)
    loudSinceRef.current = null
    attackSinceRef.current = null
    armStartLatch()
    scheduleStartFailureRecovery()
    startRecordingRef.current()
  }

  const bumpMonitorEpoch = () => {
    setMonitorEpoch((epoch) => epoch + 1)
  }

  const teardownMonitor = () => {
    if (isRecordingRef.current) return

    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }

    if (warmRetryTimerRef.current !== null) {
      window.clearInterval(warmRetryTimerRef.current)
      warmRetryTimerRef.current = null
    }

    if (healthTimerRef.current !== null) {
      window.clearInterval(healthTimerRef.current)
      healthTimerRef.current = null
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
    lastTickAtRef.current = 0
    setHandsFreeRecording(false)
    void disarmRecorderRef.current()
  }

  useLayoutEffect(() => {
    if (shouldMonitor) return
    if (isRecordingRef.current) return
    teardownMonitor()
  }, [shouldMonitor])

  useEffect(() => {
    if (isRecording) {
      clearStartLatch()
      return
    }

    if (wasRecordingRef.current && shouldMonitor) {
      loudSinceRef.current = null
      attackSinceRef.current = null
      cooldownUntilRef.current = performance.now() + COOLDOWN_MS
      const warmTimer = window.setTimeout(() => {
        void warmRecorderRef.current()
      }, 200)

      wasRecordingRef.current = isRecording
      return () => {
        window.clearTimeout(warmTimer)
      }
    }

    wasRecordingRef.current = isRecording
  }, [isRecording, shouldMonitor])

  useEffect(() => {
    if (!shouldMonitor) return
    if (isStreamAudioLive(streamRef.current)) return

    onMonitorStalledRef.current?.()

    let cancelled = false
    const retryTimer = window.setInterval(() => {
      if (cancelled) return
      if (isStreamAudioLive(streamRef.current)) {
        window.clearInterval(retryTimer)
        bumpMonitorEpoch()
        return
      }
      onMonitorStalledRef.current?.()
    }, 450)

    return () => {
      cancelled = true
      window.clearInterval(retryTimer)
    }
  }, [shouldMonitor, streamGeneration, streamRef])

  useEffect(() => {
    if (!shouldMonitor) return

    const stream = streamRef.current
    if (!isStreamAudioLive(stream)) {
      return
    }

    let cancelled = false
    const calibrationSamples: number[] = []
    let calibrated = false
    const setupEpoch = monitorEpoch

    const setup = async () => {
      if (isRecordingRef.current) return

      teardownMonitor()

      const streamAtSetup = streamRef.current
      if (!isStreamAudioLive(streamAtSetup)) {
        onMonitorStalledRef.current?.()
        return
      }

      const audioContext = new AudioContext()
      if (cancelled || setupEpoch !== monitorEpoch) {
        await audioContext.close().catch(() => {})
        return
      }

      if (audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => {})
      }

      if (cancelled || setupEpoch !== monitorEpoch) {
        await audioContext.close().catch(() => {})
        return
      }

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.08

      const source = audioContext.createMediaStreamSource(streamAtSetup!)
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source
      sampleBufferRef.current = new Float32Array(analyser.fftSize)
      lastTickAtRef.current = performance.now()

      monitorWarmUntilRef.current = performance.now() + MONITOR_WARMUP_MS
      void warmRecorderRef.current()

      const tick = () => {
        if (cancelled || !analyserRef.current || !sampleBufferRef.current) return

        lastTickAtRef.current = performance.now()
        const now = lastTickAtRef.current
        if (now < cooldownUntilRef.current && !isRecordingRef.current) return

        const ctx = audioContextRef.current
        if (ctx?.state === 'suspended') {
          void ctx.resume().catch(() => {})
        }

        if (!isStreamAudioLive(streamRef.current)) {
          onMonitorStalledRef.current?.()
          return
        }

        const profile = profileRef.current
        const metrics = readAnalyserMetrics(analyserRef.current, sampleBufferRef.current)
        const gateLevel = profile.usePeak
          ? combinedGateLevel(metrics, profile.peakWeight ?? 0.45)
          : metrics.rms
        const stopGate = Math.max(
          profile.gate * profile.stopGateRatio,
          effectiveGateRef.current * 0.55,
        )

        if (now < monitorWarmUntilRef.current) {
          calibrationSamples.push(metrics.rms)
          loudSinceRef.current = null
          attackSinceRef.current = null
          return
        }

        if (!calibrated && calibrationSamples.length > 0) {
          const sorted = [...calibrationSamples].sort((a, b) => a - b)
          quietRmsEmaRef.current = percentile(sorted, 0.5)
          effectiveGateRef.current = computeEffectiveGate(profile, quietRmsEmaRef.current)
          calibrationSamples.length = 0
          calibrated = true
          void warmRecorderRef.current()
        }

        if (!isRecordingRef.current) {
          silenceSinceRef.current = null
          recordingStartedAtRef.current = null

          if (!suppressStartRef.current && metrics.rms < effectiveGateRef.current * 0.9) {
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

          if (suppressStartRef.current) {
            loudSinceRef.current = null
            attackSinceRef.current = null
            return
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
        const stillLoud = metrics.rms >= stopGate || gateLevel >= stopGate

        if (stillLoud) {
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

      healthTimerRef.current = window.setInterval(() => {
        if (cancelled || isRecordingRef.current) return

        const now = performance.now()
        const ctx = audioContextRef.current
        const tickStale = now - lastTickAtRef.current > STALL_RECOVERY_MS
        const contextSuspended = ctx?.state === 'suspended'
        const streamDead = !isStreamAudioLive(streamRef.current)

        if (streamDead) {
          onMonitorStalledRef.current?.()
          return
        }

        if (contextSuspended) {
          void ctx?.resume().catch(() => {})
        }

        if (tickStale) {
          bumpMonitorEpoch()
        }
      }, HEALTH_CHECK_MS)
    }

    void setup()

    return () => {
      cancelled = true
      teardownMonitor()
    }
  }, [shouldMonitor, streamGeneration, streamRef, monitorEpoch])

  useEffect(() => {
    if (!shouldMonitor) return
    if (appliedVolumeThresholdRef.current === volumeThreshold) return

    const timer = window.setTimeout(() => {
      if (appliedVolumeThresholdRef.current === volumeThreshold) return

      appliedVolumeThresholdRef.current = volumeThreshold
      profileRef.current = getAutoRecordProfile(volumeThreshold)
      quietRmsEmaRef.current = 0
      effectiveGateRef.current = profileRef.current.gate
      loudSinceRef.current = null
      attackSinceRef.current = null
      clearStartLatch()
      bumpMonitorEpoch()
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [volumeThreshold, shouldMonitor])

  useEffect(() => {
    if (!shouldMonitor) return

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      bumpMonitorEpoch()
      void warmRecorderRef.current()
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [shouldMonitor])

  useEffect(() => {
    const wasSuppressed = prevSuppressStartRef.current
    prevSuppressStartRef.current = suppressStart

    if (!shouldMonitor || !wasSuppressed || suppressStart) return

    loudSinceRef.current = null
    attackSinceRef.current = null
    silenceSinceRef.current = null
    quietRmsEmaRef.current = 0
    effectiveGateRef.current = profileRef.current.gate
    monitorWarmUntilRef.current = performance.now() + POST_PLAYBACK_WARMUP_MS
    clearStartLatch()
    bumpMonitorEpoch()
    void warmRecorderRef.current()
  }, [suppressStart, shouldMonitor])

  useEffect(() => {
    const wasPaused = prevMonitoringPausedRef.current
    prevMonitoringPausedRef.current = monitoringPaused

    if (!shouldMonitor || !wasPaused || monitoringPaused) return

    loudSinceRef.current = null
    attackSinceRef.current = null
    silenceSinceRef.current = null
    quietRmsEmaRef.current = 0
    effectiveGateRef.current = profileRef.current.gate
    monitorWarmUntilRef.current = performance.now() + POST_PLAYBACK_WARMUP_MS
    clearStartLatch()
    bumpMonitorEpoch()
    void warmRecorderRef.current()
  }, [monitoringPaused, shouldMonitor])

  useEffect(() => {
    if (isRecording) return
    setHandsFreeRecording(false)
  }, [isRecording])

  const restartHandsFreeMonitor = () => {
    bumpMonitorEpoch()
    void warmRecorderRef.current()
  }

  return {
    teardownMonitor,
    handsFreeRecording: handsFreeRecording && isRecording,
    restartHandsFreeMonitor,
  }
}

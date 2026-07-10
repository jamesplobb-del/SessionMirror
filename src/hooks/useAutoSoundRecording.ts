import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { combinedGateLevel, readAnalyserMetrics } from '../utils/audioLevel'
import { getAutoRecordProfile, type AutoRecordProfile } from '../utils/appSettings'
import { AUTO_RECORD_MAX_IDLE_PREROLL_MS } from '../utils/autoRecordPlayback'
import { isAppInForeground, subscribeAppForeground } from '../utils/appForeground'
import {
  getPlaybackAudioContext,
  isSharedPlaybackContext,
} from '../utils/playbackAudioContext'
import {
  acquireNativeAudioTap,
  releaseNativeAudioTap,
  subscribeNativeAudioPitchFrames,
} from '../utils/nativeAudioPitchTap'
import { isNativeCameraPreviewActive } from '../utils/cameraSessionState'
import type { PluginListenerHandle } from '@capacitor/core'

const POLL_INTERVAL_MS = 32
const MIN_RECORDING_MS = 400
const COOLDOWN_MS = 120
const MONITOR_WARMUP_MS = 280
// The native tap starts from an already-running pre-roll recorder. Keep enough
// settling time to establish a quiet baseline without making normal speech feel
// ignored when hands-free mode is first enabled.
const NATIVE_MONITOR_WARMUP_MS = 500
const NATIVE_ARMING_QUIET_HOLD_MS = 220
const POST_PLAYBACK_WARMUP_MS = 0
const START_LATCH_MS = 1200
const WARM_RETRY_MS = 800
const HEALTH_CHECK_MS = 2500
const STALL_RECOVERY_MS = 2200
const START_FAILURE_CLEAR_MS = 450
const QUIET_EMA_ALPHA = 0.03

interface UseAutoSoundRecordingOptions {
  enabled: boolean
  monitoringAllowed: boolean
  /** Block new auto-starts (e.g. while take is playing back through speakers). */
  suppressStart: boolean
  /** Tear down mic analyser while takes play so iOS does not duck speaker output. */
  monitoringPaused?: boolean
  /** True while native audio-only capture is active (WebKit mic is suspended). */
  isNativeAudioCaptureActive?: () => boolean
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
  tryMarkAutoPerformance?: () => 'started' | 'pending' | 'unavailable'
  isAutoPreRollCaptureActive?: () => boolean
  getAutoPreRollAgeMs?: () => number
  restartAutoPreRollCapture?: () => void
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

function measureNativeFrameMetrics(buffer: Float32Array): { rms: number; peak: number } {
  let sum = 0
  let peak = 0
  for (let i = 0; i < buffer.length; i++) {
    const val = buffer[i]
    sum += val * val
    const abs = Math.abs(val)
    if (abs > peak) peak = abs
  }
  return { rms: Math.sqrt(sum / buffer.length), peak }
}

/** Same path selection camera mode uses: native tap whenever the native capture
 *  session is live (preview or recording) and WebKit mic is suspended. */
function resolveHandsFreeMonitorPath(options: {
  webKitLive: boolean
  nativeCaptureActive: boolean
  recordingActive: boolean
}): 'native-tap' | 'webkit' | 'none' {
  const nativeSessionActive = isNativeCameraPreviewActive()
  const preferNativeMonitor =
    options.nativeCaptureActive ||
    (!options.webKitLive && nativeSessionActive) ||
    (options.recordingActive && nativeSessionActive)
  if (preferNativeMonitor) return 'native-tap'
  if (options.webKitLive) return 'webkit'
  if (nativeSessionActive) return 'native-tap'
  return 'none'
}

function shouldReadNativeTapDuringRecording(
  nativeCaptureActive: boolean,
): boolean {
  return nativeCaptureActive || isNativeCameraPreviewActive()
}

export function useAutoSoundRecording({
  enabled,
  monitoringAllowed,
  suppressStart,
  monitoringPaused = false,
  isNativeAudioCaptureActive,
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
  tryMarkAutoPerformance,
  isAutoPreRollCaptureActive,
  getAutoPreRollAgeMs,
  restartAutoPreRollCapture,
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
  const nativeStartArmedRef = useRef(false)
  const nativeQuietSinceRef = useRef<number | null>(null)
  const nativeTapReadyRef = useRef(false)
  const startLatchTimerRef = useRef<number | null>(null)
  const cooldownUntilRef = useRef(0)
  const quietRmsEmaRef = useRef(0)
  const effectiveGateRef = useRef(0)
  const lastTickAtRef = useRef(0)
  const [monitorEpoch, setMonitorEpoch] = useState(0)
  const [handsFreeRecording, setHandsFreeRecording] = useState(false)
  const [appForeground, setAppForeground] = useState(isAppInForeground)
  const suppressStartRef = useRef(suppressStart)
  const isRecordingRef = useRef(isRecording)
  const startRecordingRef = useRef(startRecording)
  const stopRecordingRef = useRef(stopRecording)
  const warmRecorderRef = useRef(warmRecorder)
  const disarmRecorderRef = useRef(disarmRecorder)
  const onFinishedRef = useRef(onAutoRecordingFinished)
  const onMonitorStalledRef = useRef(onMonitorStalled)
  const tryMarkAutoPerformanceRef = useRef(tryMarkAutoPerformance)
  const isAutoPreRollCaptureActiveRef = useRef(isAutoPreRollCaptureActive)
  const getAutoPreRollAgeMsRef = useRef(getAutoPreRollAgeMs)
  const restartAutoPreRollCaptureRef = useRef(restartAutoPreRollCapture)
  const isNativeAudioCaptureActiveRef = useRef(isNativeAudioCaptureActive)
  const pendingPerformanceGateRef = useRef(false)
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
  tryMarkAutoPerformanceRef.current = tryMarkAutoPerformance
  isAutoPreRollCaptureActiveRef.current = isAutoPreRollCaptureActive
  getAutoPreRollAgeMsRef.current = getAutoPreRollAgeMs
  restartAutoPreRollCaptureRef.current = restartAutoPreRollCapture
  isNativeAudioCaptureActiveRef.current = isNativeAudioCaptureActive
  profileRef.current = getAutoRecordProfile(volumeThreshold)
  silenceMsRef.current = silenceMs
  effectiveGateRef.current = computeEffectiveGate(
    profileRef.current,
    quietRmsEmaRef.current,
  )

  // Native audio hands-free deliberately stops WebKit's microphone once the
  // hidden pre-roll owns the hardware. That can briefly make the WebKit
  // session report not-ready; the native capture is still a fully valid
  // listening source and must not be torn down because of that handoff.
  const nativeCaptureActive = isNativeAudioCaptureActiveRef.current?.() === true
  const shouldMonitor =
    enabled &&
    monitoringAllowed &&
    !monitoringPaused &&
    appForeground &&
    (ready || nativeCaptureActive)

  useEffect(() => subscribeAppForeground(setAppForeground), [])

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

    const mark = tryMarkAutoPerformanceRef.current?.()
    if (mark === 'started') {
      pendingPerformanceGateRef.current = false
      autoTriggeredRef.current = true
      // Native audio has been writing the hidden pre-roll already. The visible
      // take, its minimum length, and silence timeout all begin at the actual
      // performance trigger instead of at pre-roll startup.
      recordingStartedAtRef.current = performance.now()
      silenceSinceRef.current = null
      setHandsFreeRecording(true)
      loudSinceRef.current = null
      attackSinceRef.current = null
      armStartLatch()
      scheduleStartFailureRecovery()
      // tryMarkAutoPerformanceStart already promoted pre-roll when applicable.
      if (!isRecordingRef.current) {
        startRecordingRef.current()
      }
      return
    }

    if (mark === 'pending') {
      pendingPerformanceGateRef.current = true
      armStartLatch()
      scheduleStartFailureRecovery()
      return
    }

    autoTriggeredRef.current = true
    recordingStartedAtRef.current = performance.now()
    silenceSinceRef.current = null
    setHandsFreeRecording(true)
    loudSinceRef.current = null
    attackSinceRef.current = null
    armStartLatch()
    scheduleStartFailureRecovery()
    startRecordingRef.current()
  }

  const tryCommitPendingPerformanceStart = (): boolean => {
    if (!pendingPerformanceGateRef.current) return false
    const mark = tryMarkAutoPerformanceRef.current?.()
    if (mark !== 'started') return false

    pendingPerformanceGateRef.current = false
    autoTriggeredRef.current = true
    recordingStartedAtRef.current = performance.now()
    silenceSinceRef.current = null
    setHandsFreeRecording(true)
    if (!isRecordingRef.current) {
      startRecordingRef.current()
    }
    return true
  }

  const bumpMonitorEpoch = () => {
    setMonitorEpoch((epoch) => epoch + 1)
  }

  const maybeAutoStopFromSilence = (
    metrics: { rms: number; peak: number },
    now: number,
  ): boolean => {
    if (!autoTriggeredRef.current || !isRecordingRef.current) return false

    const profile = profileRef.current
    const gateLevel = profile.usePeak
      ? combinedGateLevel(metrics, profile.peakWeight ?? 0.45)
      : metrics.rms
    const stopGate = Math.max(
      profile.gate * profile.stopGateRatio,
      effectiveGateRef.current * 0.55,
    )

    if (recordingStartedAtRef.current === null) {
      recordingStartedAtRef.current = now
    }

    const recordingDuration = now - recordingStartedAtRef.current
    const stillLoud = metrics.rms >= stopGate || gateLevel >= stopGate

    if (stillLoud) {
      silenceSinceRef.current = null
      return false
    }
    if (recordingDuration < MIN_RECORDING_MS) return false

    if (silenceSinceRef.current === null) {
      silenceSinceRef.current = now
      return false
    }
    if (now - silenceSinceRef.current < silenceMsRef.current) return false

    console.info('[AutoSound] autoStop (silence detected)')
    onFinishedRef.current()
    autoTriggeredRef.current = false
    recordingStartedAtRef.current = null
    silenceSinceRef.current = null
    cooldownUntilRef.current = now + COOLDOWN_MS
    stopRecordingRef.current()
    return true
  }

  const shouldPreserveActiveHandsFreeCapture = () =>
    // Native audio starts recording during the visible listening state. A
    // monitor-path restart must not mistake that hidden pre-roll for disposable
    // setup and stop the capture underneath it.
    isNativeAudioCaptureActiveRef.current?.() === true ||
    ((autoTriggeredRef.current || startLatchRef.current) && isRecordingRef.current)

  const teardownMonitor = (options?: { preserveActiveCapture?: boolean }) => {
    const preserve = options?.preserveActiveCapture === true
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
    if (ctx && !isSharedPlaybackContext(ctx) && ctx.state !== 'closed') {
      void ctx.close().catch(() => {})
    }

    silenceSinceRef.current = null
    loudSinceRef.current = null
    attackSinceRef.current = null
    if (!preserve) {
      recordingStartedAtRef.current = null
      if (!startLatchRef.current) {
        autoTriggeredRef.current = false
      }
      monitorWarmUntilRef.current = 0
      nativeStartArmedRef.current = false
      nativeQuietSinceRef.current = null
      pendingPerformanceGateRef.current = false
      quietRmsEmaRef.current = 0
      effectiveGateRef.current = profileRef.current.gate
      setHandsFreeRecording(false)
      void disarmRecorderRef.current()
    } else if (autoTriggeredRef.current || isRecordingRef.current) {
      // A native capture can be active while hands-free is merely listening.
      // Do not promote that hidden pre-roll into a visible recording when a
      // React effect refreshes the monitor.
      if (recordingStartedAtRef.current === null) {
        recordingStartedAtRef.current = performance.now()
      }
      setHandsFreeRecording(true)
    }
    lastTickAtRef.current = 0
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
      loudSinceRef.current = null
      attackSinceRef.current = null
      cooldownUntilRef.current = performance.now() + COOLDOWN_MS
      const warmTimer = window.setTimeout(() => {
        if (!isAppInForeground()) return
        void warmRecorderRef.current()
      }, 100)

      wasRecordingRef.current = isRecording
      return () => {
        window.clearTimeout(warmTimer)
      }
    }

    wasRecordingRef.current = isRecording
  }, [isRecording, shouldMonitor])

  useEffect(() => {
    if (!shouldMonitor) return
    if (isNativeAudioCaptureActiveRef.current?.() === true) return
    if (isStreamAudioLive(streamRef.current)) return
    if (!isAppInForeground()) return

    onMonitorStalledRef.current?.()

    let cancelled = false
    const retryTimer = window.setInterval(() => {
      if (cancelled || !isAppInForeground()) return
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
    const isWebKitLive = isStreamAudioLive(stream)
    const nativeCaptureActive = isNativeAudioCaptureActiveRef.current?.() === true
    if (
      resolveHandsFreeMonitorPath({
        webKitLive: isWebKitLive,
        nativeCaptureActive,
        recordingActive: isRecordingRef.current,
      }) === 'none'
    ) {
      return
    }

    let cancelled = false
    const calibrationSamples: number[] = []
    let calibrated = false
    const setupEpoch = monitorEpoch
    let nativeTapListener: PluginListenerHandle | null = null
    let acquiredNativeTap = false

    const setup = async () => {
      const preserveActiveCapture = shouldPreserveActiveHandsFreeCapture()
      teardownMonitor({ preserveActiveCapture })

      const streamAtSetup = streamRef.current
      const webKitLive = isStreamAudioLive(streamAtSetup)
      const nativeCaptureActive = isNativeAudioCaptureActiveRef.current?.() === true
      const path = preserveActiveCapture
        ? 'native-tap'
        : resolveHandsFreeMonitorPath({
            webKitLive,
            nativeCaptureActive,
            recordingActive: isRecordingRef.current,
          })

      console.info('[AutoSound] monitor setup', { path })

      if (path === 'none') {
        onMonitorStalledRef.current?.()
        return
      }

      const isNativePath = path === 'native-tap'
      nativeTapReadyRef.current = false
      let nativeFrameRef: { buffer: Float32Array; timestamp: number } | null = null
      const setupStartedAt = performance.now()
      // Keep an already-triggered take running across a monitor restart. A
      // hidden native pre-roll is different: it must still settle on a quiet
      // baseline, otherwise the capture-session startup samples can be read as
      // an immediate performance attack.
      const performanceAlreadyTriggered =
        autoTriggeredRef.current || startLatchRef.current || isRecordingRef.current
      if (performanceAlreadyTriggered && isNativePath) {
        nativeStartArmedRef.current = true
        nativeQuietSinceRef.current = null
        monitorWarmUntilRef.current = setupStartedAt
        calibrated = true
      } else {
        nativeStartArmedRef.current = !isNativePath
        nativeQuietSinceRef.current = null
      }

      if (isNativePath) {
        await acquireNativeAudioTap()
        acquiredNativeTap = true
        if (cancelled || setupEpoch !== monitorEpoch) {
          if (!preserveActiveCapture) {
            void releaseNativeAudioTap()
          }
          return
        }
        nativeTapListener = await subscribeNativeAudioPitchFrames((chunk) => {
          if (cancelled) return
          nativeFrameRef = { buffer: chunk.samples, timestamp: performance.now() }
        }) ?? null
        nativeTapReadyRef.current = nativeTapListener !== null
        
        lastTickAtRef.current = performance.now()
        if (!performanceAlreadyTriggered) {
          monitorWarmUntilRef.current = performance.now() + NATIVE_MONITOR_WARMUP_MS
        }
        if (!preserveActiveCapture) {
          void warmRecorderRef.current()
        }
      } else {
        const audioContext = await getPlaybackAudioContext()
        if (cancelled || setupEpoch !== monitorEpoch) {
          return
        }

        if (audioContext.state === 'suspended') {
          await audioContext.resume().catch(() => {})
        }

        if (cancelled || setupEpoch !== monitorEpoch) {
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
      }

      let lastLevelsLog = 0

      const tick = () => {
        if (cancelled) return

        // Native audio hands-free starts the file while the UI is still in its
        // listening state. Move off the WebKit analyser as soon as that capture
        // owns the mic, rather than waiting for the visual record state to flip.
        if (
          !isNativePath &&
          shouldReadNativeTapDuringRecording(
            isNativeAudioCaptureActiveRef.current?.() === true,
          )
        ) {
          bumpMonitorEpoch()
          return
        }
        
        if (!isNativePath) {
          if (!analyserRef.current || !sampleBufferRef.current) return
        }

        lastTickAtRef.current = performance.now()
        const now = lastTickAtRef.current
        if (now < cooldownUntilRef.current && !isRecordingRef.current) return

        if (!isNativePath) {
          const ctx = audioContextRef.current
          if (ctx?.state === 'suspended') {
            void ctx.resume().catch(() => {})
          }
        }

        if (isNativePath) {
          if (
            !isNativeCameraPreviewActive() &&
            !isRecordingRef.current &&
            !isNativeAudioCaptureActiveRef.current?.()
          ) {
            if (isAppInForeground()) {
              onMonitorStalledRef.current?.()
            }
            return
          }
        } else {
          const nativeCaptureActive = isNativeAudioCaptureActiveRef.current?.() === true
          const nativeTapDuringRecording =
            isRecordingRef.current &&
            shouldReadNativeTapDuringRecording(nativeCaptureActive)
          if (!isStreamAudioLive(streamRef.current)) {
            if (nativeTapDuringRecording) {
              // WebKit mic is suspended for native capture — read levels from the
              // native tap frame ref below (same as camera mode).
            } else if (!isRecordingRef.current) {
              if (isAppInForeground()) {
                onMonitorStalledRef.current?.()
              }
              return
            } else {
              return
            }
          }
        }

        const profile = profileRef.current
        let metrics = { rms: 0, peak: 0 }
        const useNativeMetrics =
          isNativePath ||
          (isRecordingRef.current &&
            shouldReadNativeTapDuringRecording(
              isNativeAudioCaptureActiveRef.current?.() === true,
            ))

        if (useNativeMetrics) {
          const frame = nativeFrameRef
          if (frame && now - frame.timestamp < 1000) {
            metrics = measureNativeFrameMetrics(frame.buffer)
          }
        } else if (!useNativeMetrics) {
          metrics = readAnalyserMetrics(analyserRef.current!, sampleBufferRef.current!)
        }
        
        if (now - lastLevelsLog > 1000) {
          lastLevelsLog = now
          // console.debug('[AutoSound] levels', { rms: metrics.rms.toFixed(4), peak: metrics.peak.toFixed(4) })
        }

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

          tryCommitPendingPerformanceStart()

          if (isAutoPreRollCaptureActiveRef.current?.()) {
            const preRollAge = getAutoPreRollAgeMsRef.current?.() ?? 0
            if (preRollAge > AUTO_RECORD_MAX_IDLE_PREROLL_MS) {
              restartAutoPreRollCaptureRef.current?.()
              loudSinceRef.current = null
              attackSinceRef.current = null
              pendingPerformanceGateRef.current = false
            }
          }

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

          if (isNativePath && !nativeStartArmedRef.current) {
            const quietEnough = gateLevel < effectiveGateRef.current * 0.85
            if (quietEnough) {
              if (nativeQuietSinceRef.current === null) {
                nativeQuietSinceRef.current = now
              } else if (now - nativeQuietSinceRef.current >= NATIVE_ARMING_QUIET_HOLD_MS) {
                nativeStartArmedRef.current = true
              }
            } else {
              nativeQuietSinceRef.current = null
            }

            if (!nativeStartArmedRef.current) {
              loudSinceRef.current = null
              attackSinceRef.current = null
              return
            }
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
              console.info('[AutoSound] triggerAutoStart')
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
                console.info('[AutoSound] triggerAutoStart')
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
            maybeAutoStopFromSilence(metrics, now)
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
        const tickStale = now - lastTickAtRef.current > STALL_RECOVERY_MS
        
        let streamDead = false
        if (isNativePath || isNativeAudioCaptureActiveRef.current?.()) {
          streamDead =
            (!isNativeCameraPreviewActive() &&
              !isNativeAudioCaptureActiveRef.current?.()) ||
            now - (nativeFrameRef?.timestamp ?? 0) > 2000
        } else {
          streamDead = !isStreamAudioLive(streamRef.current)
          const ctx = audioContextRef.current
          if (ctx?.state === 'suspended') {
            void ctx?.resume().catch(() => {})
          }
        }

        if (streamDead) {
          if (isAppInForeground()) {
            onMonitorStalledRef.current?.()
          }
          return
        }

        if (tickStale) {
          bumpMonitorEpoch()
        }
      }, HEALTH_CHECK_MS)
    }

    void setup()

    return () => {
      cancelled = true
      nativeTapReadyRef.current = false
      const preserveActiveCapture = shouldPreserveActiveHandsFreeCapture()
      teardownMonitor({ preserveActiveCapture })
      if (nativeTapListener) {
        nativeTapListener.remove().catch(() => {})
      }
      if (acquiredNativeTap && !preserveActiveCapture) {
        void releaseNativeAudioTap()
      }
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

  const restartHandsFreeMonitor = useCallback(() => {
    if (!isAppInForeground()) return
    if (
      nativeTapReadyRef.current &&
      isNativeAudioCaptureActiveRef.current?.() === true
    ) {
      return
    }
    setMonitorEpoch((epoch) => epoch + 1)
    void warmRecorderRef.current()
  }, [])

  return {
    teardownMonitor,
    handsFreeRecording: handsFreeRecording && isRecording,
    restartHandsFreeMonitor,
  }
}

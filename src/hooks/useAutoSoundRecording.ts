import { createHandsFreeHealth } from '../utils/handsFreeHealth'
import { createHandsFreeSilence } from '../utils/handsFreeSilence'
import { advanceAutoStart } from '../utils/autoStartGate'
import { createAudioFrameFreshness } from '../utils/audioFrameFreshness'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { combinedGateLevel, readAnalyserMetrics } from '../utils/audioLevel'
import { getAutoRecordProfile, type AutoRecordProfile } from '../utils/appSettings'
import { AUTO_RECORD_MAX_IDLE_PREROLL_MS, AUTO_RECORD_PREROLL_MS } from '../utils/autoRecordPlayback'
import { isAppInForeground, subscribeAppForeground } from '../utils/appForeground'
import { getPlaybackAudioContext, isSharedPlaybackContext } from '../utils/playbackAudioContext'
import {
  acquireNativeAudioTap,
  releaseNativeAudioTap,
  subscribeNativeAudioPitchFrames,
} from '../utils/nativeAudioPitchTap'
import {
  isNativeCaptureSessionActive,
} from '../utils/cameraSessionState'
import { sharedMetronomeEngine } from '../metronome/sharedMetronomeEngine'
import type { PluginListenerHandle } from '@capacitor/core'

const POLL_INTERVAL_MS = 48
const MIN_RECORDING_MS = 400
const COOLDOWN_MS = 600
const MONITOR_WARMUP_MS = 500
// The native tap starts from an already-running pre-roll recorder. Keep enough
// settling time to establish a quiet baseline without making normal speech feel
// ignored when hands-free mode is first enabled.
const NATIVE_MONITOR_WARMUP_MS = 500
// Arming: a fresh monitor must see a few genuinely quiet frames before its
// first trigger. AVAudioSession activation and the WebKit mic ramp both land
// as a burst right at the start of the stream, and that burst used to read as
// an attack the instant hands-free came on. Wait for a quiet baseline before
// arming; the existing pre-roll preserves the onset of a sustained phrase.
const ARM_QUIET_FRAMES = 3
const POST_PLAYBACK_WARMUP_MS = 450
const START_LATCH_MS = 3500
const WARM_RETRY_MS = 800
const HEALTH_CHECK_MS = 2500
const STALL_RECOVERY_MS = 2200
const START_FAILURE_CLEAR_MS = 3000
const QUIET_EMA_ALPHA = 0.03
const METRONOME_START_HOLD_MS = 300
const METRONOME_TAIL_MS = 90
const METRONOME_CLEAN_START_FRAMES = 4

function metronomeClickGuardMs(soundId: string): number {
  // The oscillator itself is short, but the speaker, room, and iPad mic keep
  // hearing its tail after the scheduled tick. Mask that tail as well.
  if (soundId === 'soft') return 185
  if (soundId === 'classic') return 155
  return 140
}

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
  instrumentFamily?: 'Brass' | 'Woodwind' | 'Strings' | 'Voice & keys'
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
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
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
    stream?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled)
  )
}

function measureNativeFrameMetrics(buffer: Float32Array): {
  rms: number
  peak: number
} {
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
 *  session is live (preview, audio-only pre-roll, or tuner monitor) and WebKit
 *  mic is suspended. */
function resolveHandsFreeMonitorPath(options: {
  webKitLive: boolean
  nativeCaptureActive: boolean
  recordingActive: boolean
}): 'native-tap' | 'webkit' | 'none' {
  const nativeSessionActive = isNativeCaptureSessionActive()
  const preferNativeMonitor =
    options.nativeCaptureActive ||
    (!options.webKitLive && nativeSessionActive) ||
    (options.recordingActive && nativeSessionActive)
  if (preferNativeMonitor) return 'native-tap'
  if (options.webKitLive) return 'webkit'
  if (nativeSessionActive) return 'native-tap'
  return 'none'
}

function shouldReadNativeTapDuringRecording(nativeCaptureActive: boolean): boolean {
  return nativeCaptureActive || isNativeCaptureSessionActive()
}

export function useAutoSoundRecording({
  enabled,
  monitoringAllowed,
  suppressStart,
  monitoringPaused = false,
  isNativeAudioCaptureActive,
  isRecording,
  streamRef,
  streamGeneration,
  silenceMs,
  volumeThreshold,
  instrumentFamily,
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
  const healthRef = useRef(createHandsFreeHealth())
  const [handsFreeNotice, setHandsFreeNotice] = useState<'sensitive' | 'microphone' | 'start' | null>(null)
  useEffect(() => {
    healthRef.current.reset()
    setHandsFreeNotice(null)
  }, [enabled, volumeThreshold, instrumentFamily])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const sampleBufferRef = useRef<Float32Array | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const warmRetryTimerRef = useRef<number | null>(null)
  const healthTimerRef = useRef<number | null>(null)
  const setupRetryTimerRef = useRef<number | null>(null)
  const startFailureTimerRef = useRef<number | null>(null)
  const silenceSinceRef = useRef<number | null>(null)
  const silenceGateRef = useRef(createHandsFreeSilence())
  const [replayCountdown, setReplayCountdown] = useState<number | null>(null)
  const stopRequestedRef = useRef(false)
  const loudSinceRef = useRef<number | null>(null)
  const attackSinceRef = useRef<number | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const autoTriggeredRef = useRef(false)
  const startLatchRef = useRef(false)
  const monitorWarmUntilRef = useRef(0)
  const nativeTapReadyRef = useRef(false)
  const monitorReadyRef = useRef(false)
  const startLatchTimerRef = useRef<number | null>(null)
  const cooldownUntilRef = useRef(0)
  const quietRmsEmaRef = useRef(0)
  const effectiveGateRef = useRef(0)
  const lastTickAtRef = useRef(0)
  const [monitorEpoch, setMonitorEpoch] = useState(0)
  const [handsFreeRecording, setHandsFreeRecording] = useState(false)
  const [handsFreeListeningReady, setHandsFreeListeningReady] = useState(false)
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
  const profileRef = useRef(getAutoRecordProfile(volumeThreshold, instrumentFamily))
  const silenceMsRef = useRef(silenceMs)
  const wasRecordingRef = useRef(isRecording)
  const appliedVolumeThresholdRef = useRef(volumeThreshold)
  const prevSuppressStartRef = useRef(suppressStart)
  const prevMonitoringPausedRef = useRef(monitoringPaused)
  const metronomeClickGuardUntilRef = useRef(0)
  const metronomeClickPeakRef = useRef(0)
  const metronomeCleanStartFramesRef = useRef(0)
  const resetStartCandidate = () => {
    loudSinceRef.current = null
    metronomeCleanStartFramesRef.current = 0
  }

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
  profileRef.current = getAutoRecordProfile(volumeThreshold, instrumentFamily)
  silenceMsRef.current = silenceMs
  effectiveGateRef.current = computeEffectiveGate(profileRef.current, quietRmsEmaRef.current)

  // Native audio hands-free deliberately stops WebKit's microphone once the
  // hidden pre-roll owns the hardware. That can briefly make the WebKit
  // session report not-ready. Do not require `ready` here: that chicken-egg
  // left Tools/audio sitting on "Getting ready" whenever neither WebKit nor
  // the pre-roll had started yet. The monitor warms native capture itself.
  const shouldMonitor =
    enabled &&
    monitoringAllowed &&
    !monitoringPaused &&
    appForeground
  const shouldMonitorRef = useRef(shouldMonitor)
  shouldMonitorRef.current = shouldMonitor

  useEffect(() => subscribeAppForeground(setAppForeground), [])

  useEffect(() => {
    if (!shouldMonitor) {
      metronomeClickGuardUntilRef.current = 0
      metronomeClickPeakRef.current = 0
      metronomeCleanStartFramesRef.current = 0
      return
    }
    return sharedMetronomeEngine.subscribeTick((event) => {
      if (!event.audible) return
      const metronome = sharedMetronomeEngine.getSnapshot()
      metronomeClickPeakRef.current = 0
      metronomeClickGuardUntilRef.current =
        performance.now() + metronomeClickGuardMs(metronome.soundId)
    })
  }, [shouldMonitor])

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
        pendingPerformanceGateRef.current = false
        resetStartCandidate()
        setHandsFreeRecording(false)
        setHandsFreeNotice('start')
        clearStartLatch()
        void warmRecorderRef.current()
      }
    }, START_FAILURE_CLEAR_MS)
  }

  const triggerAutoStart = () => {
    if (!shouldMonitorRef.current || !isAppInForeground() ||
        startLatchRef.current || isRecordingRef.current || suppressStartRef.current) {
      return
    }
    // Remember a running click before capture steals the session. Listen-back
    // brings it back; this is what a routine step was making the player tap for.
    sharedMetronomeEngine.holdClickAcrossPlayback()

    const mark = tryMarkAutoPerformanceRef.current?.()
    if (mark === 'started') {
      pendingPerformanceGateRef.current = false
      autoTriggeredRef.current = true
      // Native audio has been writing the hidden pre-roll already. The visible
      // take, its minimum length, and silence timeout all begin at the actual
      // performance trigger instead of at pre-roll startup.
      silenceGateRef.current.reset()
      stopRequestedRef.current = false
      recordingStartedAtRef.current = performance.now()
      silenceSinceRef.current = null
      setHandsFreeRecording(true)
      resetStartCandidate()
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
    silenceGateRef.current.reset()
    stopRequestedRef.current = false
    recordingStartedAtRef.current = performance.now()
    silenceSinceRef.current = null
    setHandsFreeRecording(true)
    resetStartCandidate()
    attackSinceRef.current = null
    armStartLatch()
    scheduleStartFailureRecovery()
    startRecordingRef.current()
  }

  const tryCommitPendingPerformanceStart = (): boolean => {
    if (!pendingPerformanceGateRef.current) return false
    if (!shouldMonitorRef.current || !isAppInForeground() || suppressStartRef.current) {
      pendingPerformanceGateRef.current = false
      clearStartLatch()
      return false
    }
    const mark = tryMarkAutoPerformanceRef.current?.()
    if (mark !== 'started') return false

    sharedMetronomeEngine.holdClickAcrossPlayback()
    pendingPerformanceGateRef.current = false
    autoTriggeredRef.current = true
    silenceGateRef.current.reset()
    stopRequestedRef.current = false
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

  const setMonitorReady = (ready: boolean) => {
    if (monitorReadyRef.current === ready) return
    monitorReadyRef.current = ready
    setHandsFreeListeningReady(ready)
    if (ready) setHandsFreeNotice(current => current === 'microphone' ? null : current)
  }

  const finishHandsFreeTake = () => {
    if (!isRecordingRef.current || stopRequestedRef.current) return
    stopRequestedRef.current = true
    const now = performance.now()
    if (recordingStartedAtRef.current !== null && healthRef.current.finished(now,
      Math.max(0, now - recordingStartedAtRef.current - silenceMsRef.current))) {
      setHandsFreeNotice('sensitive')
    }
    setReplayCountdown(null)
    silenceGateRef.current.reset()
    // Register replay intent before stop delivers the finalized take.
    onFinishedRef.current()
    autoTriggeredRef.current = false
    recordingStartedAtRef.current = null
    cooldownUntilRef.current = performance.now() + COOLDOWN_MS
    stopRecordingRef.current()
  }

  const maybeAutoStopFromSilence = (
    metrics: { rms: number; peak: number }, now: number, frameMs: number,
  ): boolean => {
    if (!autoTriggeredRef.current || !isRecordingRef.current || stopRequestedRef.current) return false
    const profile = profileRef.current
    const gateLevel = profile.usePeak
      ? combinedGateLevel(metrics, profile.peakWeight ?? 0.45) : metrics.rms
    const stopGate = Math.max(profile.gate * profile.stopGateRatio, effectiveGateRef.current * 0.55)
    if (recordingStartedAtRef.current === null) recordingStartedAtRef.current = now
    if (now - recordingStartedAtRef.current < MIN_RECORDING_MS) return false
    const metronomeActive = sharedMetronomeEngine.getSnapshot().playing
    const metronomeTransient = metronomeActive && now <= metronomeClickGuardUntilRef.current
    // A click must not reset the quiet countdown. Treat its known output as
    // quiet; real sustained playing in the spaces between clicks resets it.
    // Pausing the clock here made a fast click postpone replay indefinitely.
    if (metronomeTransient) {
      const decision = silenceGateRef.current.sample(now, false, silenceMsRef.current, frameMs)
      setReplayCountdown(decision.remainingSeconds)
      if (decision.stop) finishHandsFreeTake()
      return decision.stop
    }
    const loud = metronomeActive ? metrics.rms >= stopGate : metrics.rms >= stopGate || gateLevel >= stopGate
    const decision = silenceGateRef.current.sample(now, loud, silenceMsRef.current, frameMs)
    setReplayCountdown(decision.remainingSeconds)
    if (!decision.stop) return false
    finishHandsFreeTake()
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

    if (setupRetryTimerRef.current !== null) {
      window.clearTimeout(setupRetryTimerRef.current)
      setupRetryTimerRef.current = null
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
    resetStartCandidate()
    attackSinceRef.current = null
    if (!preserve) {
      silenceGateRef.current.reset()
      setReplayCountdown(null)
      recordingStartedAtRef.current = null
      if (!startLatchRef.current) {
        autoTriggeredRef.current = false
      }
      monitorWarmUntilRef.current = 0
      pendingPerformanceGateRef.current = false
      quietRmsEmaRef.current = 0
      effectiveGateRef.current = profileRef.current.gate
      setHandsFreeRecording(false)
      setMonitorReady(false)
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
      setHandsFreeNotice(current => current === 'start' ? null : current)
      if (!wasRecordingRef.current) stopRequestedRef.current = false
      wasRecordingRef.current = true
      clearStartLatch()
      return
    }

    if (wasRecordingRef.current && shouldMonitor) {
      resetStartCandidate()
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
    if (isStreamAudioLive(streamRef.current) || isNativeCaptureSessionActive()) return
    if (!isAppInForeground()) return

    // Start the hidden pre-roll before asking the camera hook to reopen
    // WebKit. A stall refresh that raced native startup contended for the
    // same input and left the UI on "Getting ready".
    void warmRecorderRef.current()

    let cancelled = false
    const retryTimer = window.setInterval(() => {
      if (cancelled || !isAppInForeground()) return
      if (
        isNativeAudioCaptureActiveRef.current?.() === true ||
        isStreamAudioLive(streamRef.current) ||
        isNativeCaptureSessionActive()
      ) {
        window.clearInterval(retryTimer)
        bumpMonitorEpoch()
        return
      }
      void warmRecorderRef.current()
      onMonitorStalledRef.current?.()
    }, 800)

    return () => {
      cancelled = true
      window.clearInterval(retryTimer)
    }
  }, [shouldMonitor, streamGeneration, streamRef])

  // Setup itself can stall before its polling/health timers are installed
  // (notably a cold Web Audio resume). Keep recovery independent of setup.
  useEffect(() => {
    if (!shouldMonitor) return
    const watchdog = window.setInterval(() => {
      if (!shouldMonitorRef.current || !isAppInForeground()) return
      if (pollTimerRef.current !== null || setupRetryTimerRef.current !== null) return
      setMonitorReady(false)
      setHandsFreeNotice('microphone')
      void warmRecorderRef.current()
      bumpMonitorEpoch()
    }, HEALTH_CHECK_MS)
    return () => window.clearInterval(watchdog)
  }, [shouldMonitor])

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
      void warmRecorderRef.current()
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
      const path = preserveActiveCapture && (nativeCaptureActive || isNativeCaptureSessionActive())
        ? 'native-tap'
        : resolveHandsFreeMonitorPath({
            webKitLive,
            nativeCaptureActive,
            recordingActive: isRecordingRef.current,
          })

      console.info('[AutoSound] monitor setup', { path })

      if (path === 'none') {
        void warmRecorderRef.current()
        return
      }

      const isNativePath = path === 'native-tap'
      nativeTapReadyRef.current = false
      setMonitorReady(false)
      let nativeFrameRef: { buffer: Float32Array; timestamp: number; durationMs: number } | null = null
      const readFrameFreshness = createAudioFrameFreshness()
      const setupStartedAt = performance.now()
      // When levels actually began flowing. Native frames only start once
      // AVCapture has finished (re)configuring the session, which can be well
      // after we subscribe — so the warm-up and arming clocks start on the
      // first real frame, not on the subscription.
      let firstFrameAt: number | null = null
      let quietFramesSeen = 0
      // Keep an already-triggered take running across a monitor restart. A
      // hidden native pre-roll is different: it must still settle on a quiet
      // baseline, otherwise the capture-session startup samples can be read as
      // an immediate performance attack.
      const performanceAlreadyTriggered =
        autoTriggeredRef.current || startLatchRef.current || isRecordingRef.current
      // A take already in flight needs no quiet baseline — it is the silence
      // stop we are watching for now, not a start.
      let armed = performanceAlreadyTriggered
      if (performanceAlreadyTriggered && isNativePath) {
        monitorWarmUntilRef.current = setupStartedAt
        calibrated = true
      }

      if (isNativePath) {
        await acquireNativeAudioTap()
        acquiredNativeTap = true
        if (cancelled || setupEpoch !== monitorEpoch) {
          void releaseNativeAudioTap()
          acquiredNativeTap = false
          return
        }
        nativeTapListener =
          (await subscribeNativeAudioPitchFrames((chunk) => {
            if (cancelled) return
            nativeFrameRef = {
              buffer: chunk.samples,
              durationMs: chunk.samples.length / chunk.sampleRate * 1000,
              timestamp: performance.now(),
            }
          })) ?? null
        if (cancelled) {
          await nativeTapListener?.remove().catch(() => {})
          nativeTapListener = null
          return
        }
        nativeTapReadyRef.current = nativeTapListener !== null

        lastTickAtRef.current = performance.now()
        if (!performanceAlreadyTriggered) {
          // Provisional; re-anchored to the first fresh frame inside tick().
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

        if (audioContext.state !== 'running' && audioContext.state !== 'closed') {
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

        firstFrameAt = performance.now()
        monitorWarmUntilRef.current = firstFrameAt + MONITOR_WARMUP_MS
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
          shouldReadNativeTapDuringRecording(isNativeAudioCaptureActiveRef.current?.() === true)
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
          if (ctx && ctx.state !== 'running') {
            if (ctx.state === 'closed') bumpMonitorEpoch()
            else void ctx.resume().catch(() => {})
            setMonitorReady(false)
            silenceGateRef.current.pause()
            resetStartCandidate()
            return
          }
        }

        if (isNativePath) {
          if (
            !isNativeCaptureSessionActive() &&
            !isRecordingRef.current &&
            !isNativeAudioCaptureActiveRef.current?.()
          ) {
            if (isAppInForeground()) {
              void warmRecorderRef.current()
            }
            return
          }
        } else {
          const nativeCaptureActive = isNativeAudioCaptureActiveRef.current?.() === true
          const nativeTapDuringRecording =
            isRecordingRef.current && shouldReadNativeTapDuringRecording(nativeCaptureActive)
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
            shouldReadNativeTapDuringRecording(isNativeAudioCaptureActiveRef.current?.() === true))

        let nativeFrameFresh = false
        if (useNativeMetrics) {
          const frame = nativeFrameRef
          const freshness = readFrameFreshness(frame?.timestamp, now)
          if (freshness === 'stale' || freshness === 'gap') {
            // Missing audio is neither sustained playing nor sustained silence.
            resetStartCandidate()
            attackSinceRef.current = null
            quietFramesSeen = 0
          }
          if (frame && (freshness === 'fresh' || freshness === 'gap')) {
            metrics = measureNativeFrameMetrics(frame.buffer)
            nativeFrameFresh = true
          }
        } else if (!useNativeMetrics) {
          metrics = readAnalyserMetrics(analyserRef.current!, sampleBufferRef.current!)
        }

        if (now - lastLevelsLog > 1000) {
          lastLevelsLog = now
          // console.debug('[AutoSound] levels', { rms: metrics.rms.toFixed(4), peak: metrics.peak.toFixed(4) })
        }



        if (useNativeMetrics && !nativeFrameFresh) {
          return
        }

        if (isNativePath && firstFrameAt === null) {
          firstFrameAt = now
          if (!performanceAlreadyTriggered) {
            monitorWarmUntilRef.current = now + NATIVE_MONITOR_WARMUP_MS
          }
        }

        if (now < monitorWarmUntilRef.current) {
          // Learn the room from every startup frame. The lower percentile
          // keeps a note played during startup from becoming the noise floor,
          // while still adapting when the room is louder than the saved gate.
          calibrationSamples.push(metrics.rms)
          quietFramesSeen = metrics.rms < profile.gate * 0.9 ? quietFramesSeen + 1 : 0
          resetStartCandidate()
          attackSinceRef.current = null
          return
        }

        if (!calibrated && calibrationSamples.length > 0) {
          const sorted = [...calibrationSamples].sort((a, b) => a - b)
          quietRmsEmaRef.current = percentile(sorted, 0.2)
          effectiveGateRef.current = computeEffectiveGate(profile, quietRmsEmaRef.current)
          calibrationSamples.length = 0
          calibrated = true
          void warmRecorderRef.current()
        }

        // Require consecutive quiet frames. A timeout must never arm in
        // ongoing room noise; the musician can always use manual recording.
        if (!armed) {
          quietFramesSeen = metrics.rms < effectiveGateRef.current * 0.9 ? quietFramesSeen + 1 : 0
          if (healthRef.current.observeArming(now, quietFramesSeen < ARM_QUIET_FRAMES)) {
            setHandsFreeNotice('sensitive')
          }
          if (quietFramesSeen < ARM_QUIET_FRAMES) {
            resetStartCandidate()
            attackSinceRef.current = null
            return
          }
          armed = true
        }

        // A live level meter is not proof that the hidden recorder is ready.
        // Wait until it has actually retained the promised pre-roll before
        // inviting a sound-triggered take; cold-starting at the gate drops the
        // beginning of a phrase. Older callers without pre-roll hooks retain
        // their existing behavior.
        if (!isRecordingRef.current && isAutoPreRollCaptureActiveRef.current && getAutoPreRollAgeMsRef.current) {
          const preRollActive = isAutoPreRollCaptureActiveRef.current()
          if (!preRollActive || getAutoPreRollAgeMsRef.current() < AUTO_RECORD_PREROLL_MS) {
            setMonitorReady(false)
            resetStartCandidate()
            attackSinceRef.current = null
            return
          }
        }

        setMonitorReady(true)

        if (!isRecordingRef.current) {
          silenceSinceRef.current = null
          recordingStartedAtRef.current = null

          // A pending recorder must not turn an old noise into a later take.
          if (pendingPerformanceGateRef.current && metrics.rms < effectiveGateRef.current) {
            pendingPerformanceGateRef.current = false
            clearStartLatch()
            resetStartCandidate()
          } else {
            tryCommitPendingPerformanceStart()
          }

          if (isAutoPreRollCaptureActiveRef.current?.()) {
            const preRollAge = getAutoPreRollAgeMsRef.current?.() ?? 0
            if (preRollAge > AUTO_RECORD_MAX_IDLE_PREROLL_MS) {
              restartAutoPreRollCaptureRef.current?.()
              resetStartCandidate()
              attackSinceRef.current = null
              pendingPerformanceGateRef.current = false
            }
          }

          if (!suppressStartRef.current && metrics.rms < effectiveGateRef.current * 0.9) {
            quietRmsEmaRef.current =
              quietRmsEmaRef.current === 0
                ? metrics.rms
                : quietRmsEmaRef.current * (1 - QUIET_EMA_ALPHA) + metrics.rms * QUIET_EMA_ALPHA
            effectiveGateRef.current = computeEffectiveGate(profile, quietRmsEmaRef.current)
          }

          if (suppressStartRef.current) {
            resetStartCandidate()
            attackSinceRef.current = null
            armed = false
            quietFramesSeen = 0
            return
          }

          const currentGate = effectiveGateRef.current
          const metronomeActive = sharedMetronomeEngine.getSnapshot().playing
          const metronomeTransient = metronomeActive && now <= metronomeClickGuardUntilRef.current

          if (metronomeTransient) {
            // Keep a genuine phrase candidate across the known click. Only
            // clean frames can confirm it, so a click cannot advance a start.
            metronomeClickPeakRef.current = Math.max(metronomeClickPeakRef.current, metrics.rms)
            attackSinceRef.current = null
            return
          }

          // Require sustained energy, not a peak from a tap, click, or mic bump.
          attackSinceRef.current = null
          const inClickTail = metronomeActive && now <= metronomeClickGuardUntilRef.current + METRONOME_TAIL_MS
          const tailGate = inClickTail
            ? Math.max(currentGate, metronomeClickPeakRef.current * 0.45)
            : currentGate
          if (inClickTail && metrics.rms < tailGate) return
          const decision = advanceAutoStart(loudSinceRef.current, now, metrics.rms, tailGate,
            Math.max(profile.holdMs, metronomeActive ? METRONOME_START_HOLD_MS : 0))
          loudSinceRef.current = decision.since
          metronomeCleanStartFramesRef.current = decision.since === null
            ? 0 : metronomeCleanStartFramesRef.current + 1
          if (decision.start &&
              (!metronomeActive || metronomeCleanStartFramesRef.current >= METRONOME_CLEAN_START_FRAMES) &&
              !startLatchRef.current) triggerAutoStart()

          return
        }

        resetStartCandidate()
        attackSinceRef.current = null

        if (!autoTriggeredRef.current) return
        if (maybeAutoStopFromSilence(metrics, now, useNativeMetrics ? (nativeFrameRef?.durationMs ?? 0) : POLL_INTERVAL_MS)) {
          // Each new take must earn a fresh quiet baseline after cooldown.
          armed = false
          quietFramesSeen = 0
          setMonitorReady(false)
        }
      }

      pollTimerRef.current = window.setInterval(tick, POLL_INTERVAL_MS)

      warmRetryTimerRef.current = window.setInterval(() => {
        if (cancelled || isRecordingRef.current || startLatchRef.current) return
        void warmRecorderRef.current()
      }, WARM_RETRY_MS)

      healthTimerRef.current = window.setInterval(() => {
        if (cancelled) return

        const now = performance.now()
        const tickStale = now - lastTickAtRef.current > STALL_RECOVERY_MS

        let streamDead = false
        if (isNativePath || isNativeAudioCaptureActiveRef.current?.()) {
          const frameAt = nativeFrameRef?.timestamp
          const sessionAlive =
            isNativeCaptureSessionActive() || isNativeAudioCaptureActiveRef.current?.() === true
          const framesWentQuiet = frameAt != null && now - frameAt > 4000
          const neverStarted = frameAt == null && now - setupStartedAt > 3500
          // Session flags can outlive the hardware or the tap subscription.
          // Fresh samples, not a cached "active" flag, prove mic health.
          streamDead = !sessionAlive || framesWentQuiet || neverStarted
        } else {
          streamDead = !isStreamAudioLive(streamRef.current)
          const ctx = audioContextRef.current
          if (ctx && ctx.state !== 'running') {
            void ctx?.resume().catch(() => {})
          }
        }

        if (streamDead) {
          setMonitorReady(false)
          setHandsFreeNotice('microphone')
          // Reattach the monitor while preserving a real take. Only idle
          // pre-roll may be discarded and rebuilt below.
          if (isRecordingRef.current) {
            if (isAppInForeground()) bumpMonitorEpoch()
            return
          }
          if (isAppInForeground()) {
            // Warm native capture first. Asking the camera hook to reopen
            // WebKit here is what stalled Hands-Free on "Getting ready".
            if (isNativePath && isAutoPreRollCaptureActiveRef.current?.()) {
              restartAutoPreRollCaptureRef.current?.()
            }
            void warmRecorderRef.current()
            bumpMonitorEpoch()
            if (!isNativePath && !isNativeAudioCaptureActiveRef.current?.()) {
              onMonitorStalledRef.current?.()
            }
          }
          return
        }

        if (tickStale) {
          bumpMonitorEpoch()
        }
      }, HEALTH_CHECK_MS)
    }

    void setup().catch(() => {
      if (!cancelled) {
        setMonitorReady(false)
        setHandsFreeNotice('microphone')
        teardownMonitor({ preserveActiveCapture: shouldPreserveActiveHandsFreeCapture() })
        setupRetryTimerRef.current = window.setTimeout(() => {
          setupRetryTimerRef.current = null
          if (!cancelled && shouldMonitorRef.current) bumpMonitorEpoch()
        }, HEALTH_CHECK_MS)
      }
      if (nativeTapListener) { void nativeTapListener.remove().catch(() => {}); nativeTapListener = null }
      if (acquiredNativeTap) { void releaseNativeAudioTap(); acquiredNativeTap = false }
    })

    return () => {
      cancelled = true
      nativeTapReadyRef.current = false
      const preserveActiveCapture = shouldPreserveActiveHandsFreeCapture()
      teardownMonitor({ preserveActiveCapture })
      if (nativeTapListener) {
        nativeTapListener.remove().catch(() => {})
      }
      if (acquiredNativeTap) {
        void releaseNativeAudioTap()
        acquiredNativeTap = false
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
      resetStartCandidate()
      attackSinceRef.current = null
      clearStartLatch()
      bumpMonitorEpoch()
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [volumeThreshold, instrumentFamily, shouldMonitor])

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

    resetStartCandidate()
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

    resetStartCandidate()
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

  const restartHandsFreeMonitor = useCallback((options?: { force?: boolean }) => {
    if (!isAppInForeground()) return
    // `isNativeAudioCaptureActive()` reads a JS mirror of the last state we
    // pushed to native, not the live hardware. After an interruption (alarm,
    // call, Siri) it can still report an active capture that iOS has already
    // torn down — and this guard then skipped the very restart that would have
    // rebuilt it, leaving hands-free permanently deaf. Callers recovering from
    // a lifecycle event must be able to insist.
    if (
      !options?.force &&
      nativeTapReadyRef.current &&
      isNativeAudioCaptureActiveRef.current?.() === true
    ) {
      return
    }
    // A restart is a real handoff, especially after Camera playback. Do not
    // leave the old room's ready flag visible while the new native tap is
    // still being acquired; that made Tools show “Your turn” while deaf.
    setMonitorReady(false)
    setMonitorEpoch((epoch) => epoch + 1)
    void warmRecorderRef.current()
  }, [])

  return {
    teardownMonitor,
    handsFreeRecording: handsFreeRecording && isRecording,
    handsFreeListeningReady: handsFreeListeningReady && shouldMonitor && !suppressStart,
    restartHandsFreeMonitor,
    replayCountdown: isRecording ? replayCountdown : null,
    finishHandsFreeTake,
    handsFreeNotice: enabled ? handsFreeNotice : null,
  }
}

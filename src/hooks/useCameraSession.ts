import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import type { RecordingMode } from '../types'
import {
  createMediaRecorder,
  getAudioCaptureConstraints,
  getRecorderMimeTypeForMode,
  getVideoCaptureConstraints,
  RECORDING_TIMESLICE_MS,
  shouldUseRecordingTimeslice,
} from '../utils/mobileVideo'
import {
  maybeBoostTabletPreviewResolution,
  resetCameraPreviewZoom,
  normalizeVideoPreviewAfterWake,
} from '../utils/videoCapture'
import { readRecordingOrientation } from '../utils/takeVideoTransform'
import {
  persistRecordingBlob,
  composeBufferedRecordingBlob,
  StreamingTakeWriter,
  type RecordingCompletePayload,
  type MultitrackRecordingStopOptions,
} from '../utils/takeStorage'
import { tuneMusicRecordingStream, getActiveCaptureProfile } from '../utils/audioCapture'
import {
  computePlaybackGainMetadata,
  snapshotCaptureAudioTrack,
  type RecordingCaptureDiagnostics,
  type RecordingTrackSnapshot,
} from '../utils/recordingDiagnostics'
import { AUTO_RECORD_PREROLL_MS } from '../utils/autoRecordPlayback'
import {
  isAutoPlaybackHoldingMicWarmup,
  isInlineTakePlaybackDeferringCameraPreview,
} from '../utils/takePlaybackAudio'
import { buildRecorderStream, releaseRecorderStream } from '../utils/recordingStream'
import {
  applyViewportCssVarsOnResume,
  CAMERA_PREVIEW_LAYOUT_RECOVERY_EVENT,
} from '../utils/viewportSync'
import { scheduleAfterPaint } from '../utils/scheduleDeferred'
import {
  ensureNativeCameraSessionHealthy,
  startNativeCameraBridge,
  startNativeCameraRecording,
  stopNativeCameraBridge,
  stopNativeCameraPreview,
  stopNativeCameraRecording,
  setNativeCameraPassthrough,
  getAudioHardwareRtl,
} from '../utils/nativeCameraTest'
import { applyMicInputPreference } from '../utils/audioSessionRoute'
import { resolveMicPreferenceForLiveCapture } from '../utils/liveMicRoute'
import { releaseAllLiveMicPitchGraphs } from './useLivePitchTracker'
import { syncNativeCameraSessionState } from '../utils/cameraSessionState'
import { isAppInForeground } from '../utils/appForeground'
import type { MicInputPreference } from '../utils/appSettings'

interface UseCameraSessionOptions {
  onRecordingComplete: (payload: RecordingCompletePayload) => void
  secondaryPreviewRef?: RefObject<HTMLVideoElement | null>
  onBeforeForegroundRestart?: () => void
  onAfterForegroundRestart?: () => void
  nativeExperimentalAudioEnabled?: boolean
  /** iOS-only: record video via native AVFoundation (fixes WebKit MediaRecorder frame-drop freeze). */
  nativeCameraRecordingEnabled?: boolean
  micInputPreference?: MicInputPreference
}

const CAMERA_RELEASE_DELAY_MS = 700
const FOREGROUND_RESTART_DELAY_MS = 250
const IOS_CAMERA_RELEASE_DELAY_MS = 700
/** Minimal delay after releasing WebKit before native bridge acquires the camera. */
const IOS_NATIVE_BRIDGE_HANDOFF_MS = 120
const IOS_AUDIO_TO_VIDEO_DELAY_MS = 200
const IOS_VIDEO_TO_AUDIO_DELAY_MS = 280
const BACKGROUND_SUSPEND_DELAY_MS = 0
const RESUME_IN_FLIGHT_TIMEOUT_MS = 15000

function detachPreviewStream(video: HTMLVideoElement | null) {
  if (!video) return
  try {
    video.pause()
    video.srcObject = null
    video.removeAttribute('src')
    video.load()
  } catch {
    /* ignore */
  }
}

function isStreamRecordable(stream: MediaStream | null, mode: RecordingMode): boolean {
  if (!stream) return false

  const audioLive = stream
    .getAudioTracks()
    .some((track) => track.readyState === 'live' && track.enabled)
  if (!audioLive) return false

  if (mode === 'audio') return true

  return stream
    .getVideoTracks()
    .some((track) => track.readyState === 'live' && track.enabled)
}

/** Audio mode must not reuse a camera stream that still has live video tracks. */
function isStreamCompatibleForMode(stream: MediaStream | null, mode: RecordingMode): boolean {
  if (!isStreamRecordable(stream, mode)) return false
  if (mode !== 'audio') return true

  return !stream!
    .getVideoTracks()
    .some((track) => track.readyState === 'live' && track.enabled)
}

/** Drop camera video tracks but keep the live mic when switching video → audio. */
function releaseVideoTracksOnly(stream: MediaStream | null) {
  stream?.getVideoTracks().forEach((track) => {
    try {
      track.stop()
    } catch {
      /* ignore */
    }
  })
}

function canSoftHandoffToAudio(stream: MediaStream | null): boolean {
  if (!stream) return false
  const audioLive = stream
    .getAudioTracks()
    .some((track) => track.readyState === 'live' && track.enabled)
  if (!audioLive) return false
  return stream
    .getVideoTracks()
    .some((track) => track.readyState === 'live' && track.enabled)
}

function detachRecorder(recorder: MediaRecorder) {
  recorder.ondataavailable = null
  recorder.onstop = null
  recorder.onerror = null
}

function isVideoPreviewRecoverable(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
  mode: RecordingMode,
): boolean {
  if (mode !== 'video' || !video || !stream) return true
  const videoLive = stream
    .getVideoTracks()
    .some((track) => track.readyState === 'live' && track.enabled)
  if (!videoLive) return false
  return video.srcObject === stream
}

function isVideoPreviewHealthy(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
  mode: RecordingMode,
): boolean {
  if (!isVideoPreviewRecoverable(video, stream, mode)) return false
  if (mode !== 'video' || !video) return true
  return (
    !video.paused &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  )
}

function attachPreviewStream(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
  mode: RecordingMode,
) {
  if (!video) return

  if (!stream || mode === 'audio') {
    if (video.srcObject) {
      video.srcObject = null
    }
    return
  }

  if (video.srcObject !== stream) {
    video.srcObject = stream
  }
  video.muted = true
  if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    void video.play().catch((err) => console.warn('Playback intercepted:', err))
  }
}

function attachPreviewTargets(
  primary: HTMLVideoElement | null,
  secondary: HTMLVideoElement | null,
  stream: MediaStream | null,
  mode: RecordingMode,
) {
  attachPreviewStream(primary, stream, mode)
  attachPreviewStream(secondary, stream, mode)
}

function detachPreviewTargets(
  primary: HTMLVideoElement | null,
  secondary: HTMLVideoElement | null,
) {
  detachPreviewStream(primary)
  detachPreviewStream(secondary)
}

function getMediaConstraints(mode: RecordingMode): MediaStreamConstraints {
  return mode === 'audio'
    ? { audio: getAudioCaptureConstraints(), video: false }
    : {
        audio: getAudioCaptureConstraints(),
        video: getVideoCaptureConstraints(),
      }
}

function logGetUserMediaEvent(
  phase: string,
  caller: string,
  payload: Record<string, unknown> = {},
): void {
  console.info(`[WebRTCTrace] getUserMedia ${phase}`, {
    caller,
    ...payload,
    stack: new Error().stack,
  })
}

function describeMediaStream(stream: MediaStream): Record<string, unknown> {
  return {
    id: stream.id,
    active: stream.active,
    audioTracks: stream.getAudioTracks().map((track) => ({
      id: track.id,
      label: track.label,
      enabled: track.enabled,
      readyState: track.readyState,
      settings: track.getSettings?.(),
    })),
    videoTracks: stream.getVideoTracks().map((track) => ({
      id: track.id,
      label: track.label,
      enabled: track.enabled,
      readyState: track.readyState,
      settings: track.getSettings?.(),
    })),
  }
}

export function useCameraSession({
  onRecordingComplete,
  secondaryPreviewRef,
  onBeforeForegroundRestart,
  onAfterForegroundRestart,
  nativeExperimentalAudioEnabled = false,
  nativeCameraRecordingEnabled = false,
  micInputPreference = 'headphone',
}: UseCameraSessionOptions) {
  const previewRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordStreamRef = useRef<MediaStream | null>(null)
  const writerRef = useRef<StreamingTakeWriter | null>(null)
  const activeTakeIdRef = useRef<string | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recorderMimeTypeRef = useRef<string>('video/webm')
  const recordingModeRef = useRef<RecordingMode>('video')
  const previousRecordingModeRef = useRef<RecordingMode>('video')
  const isRecordingRef = useRef(false)
  const readyRef = useRef(false)
  const resumeInFlightRef = useRef(false)
  const streamAcquireInFlightRef = useRef(false)
  const captureSessionEpochRef = useRef(0)
  const queuedCaptureRequestModeRef = useRef<RecordingMode | null>(null)
  const previewHealthyRef = useRef(false)
  const foregroundRestartTokenRef = useRef(0)
  const foregroundRestartTimerRef = useRef<number | null>(null)
  const backgroundSuspendTimerRef = useRef<number | null>(null)
  const releaseTimerRef = useRef<number | null>(null)
  const elapsedRef = useRef(0)
  const onCompleteRef = useRef(onRecordingComplete)
  const onBeforeForegroundRestartRef = useRef(onBeforeForegroundRestart)
  const onAfterForegroundRestartRef = useRef(onAfterForegroundRestart)
  const nativeExperimentalAudioEnabledRef = useRef(nativeExperimentalAudioEnabled)
  const micInputPreferenceRef = useRef<MicInputPreference>(micInputPreference)
  const queuedMicPreferenceRef = useRef<MicInputPreference | null>(micInputPreference)
  const nativeExperimentalRecordingRef = useRef(false)
  /** Settle promise of the in-flight native start — Stop awaits this so it never races didStartRecording. */
  const nativeStartSettleRef = useRef<Promise<boolean> | null>(null)
  /** While true (multitrack stage open), native failures must not tear down the bridge preview. */
  const suppressBridgeRecoveryRef = useRef(false)
  const nativeCameraRecordingEnabledRef = useRef(nativeCameraRecordingEnabled)
  const nativePreviewActiveRef = useRef(false)
  const nativePreviewStartTokenRef = useRef(0)
  const nativeBridgeAcquireInFlightRef = useRef(false)
  const ensureRecordableStreamRef = useRef<(() => Promise<MediaStream | null>) | null>(null)
  const requestCameraAccessRef = useRef<((requestedMode?: RecordingMode) => void) | null>(null)
  const armedAutoAudioRef = useRef<{
    recorder: MediaRecorder
    writer: StreamingTakeWriter
    takeId: string
    mimeType: string
  } | null>(null)
  const warmAutoAudioInFlightRef = useRef(false)
  const autoAudioDisarmInFlightRef = useRef<Promise<void> | null>(null)
  const autoPreRollActiveRef = useRef(false)
  const autoPerformanceActiveRef = useRef(false)
  const autoPreRollStartedAtRef = useRef(0)
  const autoPerformanceStartedAtRef = useRef(0)
  const recordingOrientationRef = useRef<'portrait' | 'landscape'>('portrait')
  const scheduleWarmAutoAudioRef = useRef<() => void>(() => {})
  onCompleteRef.current = onRecordingComplete
  onBeforeForegroundRestartRef.current = onBeforeForegroundRestart
  onAfterForegroundRestartRef.current = onAfterForegroundRestart
  nativeExperimentalAudioEnabledRef.current = nativeExperimentalAudioEnabled
  nativeCameraRecordingEnabledRef.current = nativeCameraRecordingEnabled
  micInputPreferenceRef.current = micInputPreference
  queuedMicPreferenceRef.current = micInputPreference

  const [error, setError] = useState<string | null>(null)
  const [needsPermission, setNeedsPermission] = useState(false)
  const [permissionRequestInFlight, setPermissionRequestInFlight] = useState(false)
  const permissionRequestInFlightRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  /** True from the moment a native recording stop begins until it fully settles (success or failure). */
  const [isStopping, setIsStopping] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('video')
  const [streamGeneration, setStreamGeneration] = useState(0)
  const [isPreviewRecovering, setIsPreviewRecovering] = useState(false)
  const [nativeLivePreviewActive, setNativeLivePreviewActive] = useState(false)
  const [nativeLivePreviewSeedUrl, setNativeLivePreviewSeedUrl] = useState<string | null>(null)

  recordingModeRef.current = recordingMode
  isRecordingRef.current = isRecording
  readyRef.current = ready

  const syncPreviewTargets = useCallback(
    (stream: MediaStream | null, mode?: RecordingMode) => {
      const activeMode = mode ?? recordingModeRef.current
      attachPreviewTargets(
        previewRef.current,
        secondaryPreviewRef?.current ?? null,
        stream,
        activeMode,
      )
      return isVideoPreviewHealthy(previewRef.current, stream, activeMode)
    },
    [secondaryPreviewRef],
  )

  const normalizeReusableVideoPreview = useCallback(
    async (stream: MediaStream | null, mode: RecordingMode = recordingModeRef.current): Promise<void> => {
      if (!stream || mode !== 'video') return
      resetCameraPreviewZoom()
      await normalizeVideoPreviewAfterWake(stream)
    },
    [],
  )

  const ensureCameraPreviewActive = useCallback((): boolean => {
    const mode = recordingModeRef.current
    if (mode !== 'video') {
      previewHealthyRef.current = false
      return false
    }

    if (nativePreviewActiveRef.current) {
      setNeedsPermission(false)
      setReady(true)
      previewHealthyRef.current = true
      return true
    }

    const stream = streamRef.current
    if (!stream || !isStreamRecordable(stream, mode)) {
      previewHealthyRef.current = false
      return false
    }

    void normalizeReusableVideoPreview(stream, mode).then(() => {
      if (streamRef.current === stream && recordingModeRef.current === mode) {
        syncPreviewTargets(stream, mode)
      }
    })
    syncPreviewTargets(stream, mode)

    const videos = [previewRef.current, secondaryPreviewRef?.current ?? null]
    for (const video of videos) {
      if (!video || !stream) continue
      if (video.srcObject !== stream) {
        video.srcObject = stream
      }
      video.muted = true
      if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        void video.play().catch((err) => console.warn('Playback intercepted:', err))
      }
    }

    setNeedsPermission(false)
    setReady(true)
    const healthy = isVideoPreviewHealthy(previewRef.current, stream, mode)
    previewHealthyRef.current = healthy
    return healthy
  }, [normalizeReusableVideoPreview, secondaryPreviewRef, syncPreviewTargets])

  const retuneCaptureAudio = useCallback(async () => {
    const stream = streamRef.current
    if (!stream) return
    await tuneMusicRecordingStream(stream)
  }, [])

  const detachAllPreviewTargets = useCallback(() => {
    detachPreviewTargets(
      previewRef.current,
      secondaryPreviewRef?.current ?? null,
    )
  }, [secondaryPreviewRef])

  const cancelScheduledRelease = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }
  }, [])

  const stopStreamTracks = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    })
  }, [])

  const abortActiveWriter = useCallback(async () => {
    const writer = writerRef.current
    writerRef.current = null
    activeTakeIdRef.current = null
    if (writer) {
      try {
        await writer.abort()
      } catch {
        /* filesystem errors must not block camera recovery */
      }
    }
  }, [])

  const isCaptureSessionStale = useCallback(
    (epoch: number, _mode: RecordingMode, cancelled?: () => boolean) => {
      return (
        cancelled?.() === true ||
        epoch !== captureSessionEpochRef.current
      )
    },
    [],
  )

  const forceClearCameraState = useCallback(() => {
    captureSessionEpochRef.current += 1
    if (recorderRef.current?.state === 'recording') {
      try {
        recorderRef.current.stop()
      } catch {
        /* ignore */
      }
    }
    if (recorderRef.current) {
      detachRecorder(recorderRef.current)
    }
    recorderRef.current = null
    chunksRef.current = []
    writerRef.current = null
    activeTakeIdRef.current = null

    streamRef.current?.getTracks().forEach((track) => {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    })
    streamRef.current = null
    setReady(false)
    setStreamGeneration((generation) => generation + 1)

    detachAllPreviewTargets()
  }, [detachAllPreviewTargets])

  const releaseLiveStream = useCallback(() => {
    stopStreamTracks(streamRef.current)
    streamRef.current = null
    resetCameraPreviewZoom()
    setReady(false)
    setStreamGeneration((generation) => generation + 1)
    detachAllPreviewTargets()
  }, [detachAllPreviewTargets, stopStreamTracks])

  const clearStaleCaptureStartState = useCallback(() => {
    streamAcquireInFlightRef.current = false
    permissionRequestInFlightRef.current = false
    setPermissionRequestInFlight(false)
    resumeInFlightRef.current = false
    setIsPreviewRecovering(false)
  }, [])

  /** iOS-only native AVFoundation recorder (fixes WebKit MediaRecorder frame-drop freeze). */
  const isNativeVideoRecordingEnabled = useCallback(
    () =>
      nativeCameraRecordingEnabledRef.current &&
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === 'ios',
    [],
  )

  const restoreWebKitPreviewAfterNativeRecording = useCallback(async () => {
    nativePreviewStartTokenRef.current += 1
    setNativeLivePreviewActive(false)
    setNativeLivePreviewSeedUrl(null)
    nativePreviewActiveRef.current = false
    await setNativeCameraPassthrough(false)
    await stopNativeCameraBridge()
    await stopNativeCameraPreview()
    void syncNativeCameraSessionState({ previewActive: false, recordingActive: false })
    if (recordingModeRef.current === 'video' && !isNativeVideoRecordingEnabled()) {
      await ensureRecordableStreamRef.current?.()
    }
  }, [isNativeVideoRecordingEnabled])

  const releaseWebKitVideoTracksForNativeBridge = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getVideoTracks()) {
        try {
          track.stop()
        } catch {
          /* ignore */
        }
      }
      // Keep any live audio track (and streamRef) around for legacy WebKit
      // consumers. The camera-mode pitch widget no longer depends on this
      // stream at all — while the native preview session is active it pulls
      // PCM from the native audio tap (see nativeAudioPitchTap.ts /
      // useLivePitchTracker's native-tap graph), which shares the capture
      // session's mic and therefore has no WebKit/native contention. The
      // WebKit track is still suspended narrowly around the recording window
      // (see suspendSharedMicForNativeRecording below) and never reacquired
      // while the native session is live — a fresh getUserMedia() here caused
      // camera freezes.
      if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) {
        streamRef.current = null
      }
    }
    detachAllPreviewTargets()
    setStreamGeneration((generation) => generation + 1)
  }, [detachAllPreviewTargets])

  /**
   * Stop the shared WebKit mic track right before native recording starts.
   * A live WebKit getUserMedia audio track left running while
   * AVCaptureMovieFileOutput is writing to disk contends for the same
   * hardware input and starves the file's audio connection, silently
   * dropping the audio track from the exported video entirely.
   */
  const suspendSharedMicForNativeRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    for (const track of stream.getAudioTracks()) {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const acquireNativeVideoBridge = useCallback(async (): Promise<boolean> => {
    if (!isNativeVideoRecordingEnabled()) return false
    if (nativePreviewActiveRef.current) {
      setNativeLivePreviewActive(true)
      setNeedsPermission(false)
      setReady(true)
      return true
    }
    if (nativeBridgeAcquireInFlightRef.current) return false

    nativeBridgeAcquireInFlightRef.current = true
    try {
      releaseWebKitVideoTracksForNativeBridge()
      if (Capacitor.isNativePlatform()) {
        await new Promise((resolve) => window.setTimeout(resolve, IOS_NATIVE_BRIDGE_HANDOFF_MS))
      }

      const result = await startNativeCameraBridge({
        useFrontCamera: true,
        audioSessionProfile: 'videoRecording',
        micInputPreference: micInputPreferenceRef.current,
      })

      if (!result) {
        setReady(false)
        return false
      }

      nativePreviewActiveRef.current = true
      setNativeLivePreviewActive(true)
      setNativeLivePreviewSeedUrl(null)
      setNeedsPermission(false)
      setReady(true)
      void syncNativeCameraSessionState({ previewActive: true, recordingActive: false })
      return true
    } finally {
      nativeBridgeAcquireInFlightRef.current = false
    }
  }, [isNativeVideoRecordingEnabled, releaseWebKitVideoTracksForNativeBridge])

  const stopNativeVideoBridge = useCallback(async () => {
    nativePreviewStartTokenRef.current += 1
    setNativeLivePreviewActive(false)
    setNativeLivePreviewSeedUrl(null)
    nativePreviewActiveRef.current = false
    await stopNativeCameraBridge()
    void syncNativeCameraSessionState({ previewActive: false, recordingActive: false })
  }, [])

  useEffect(() => {
    if (nativeCameraRecordingEnabled || !nativePreviewActiveRef.current) return
    void restoreWebKitPreviewAfterNativeRecording()
  }, [nativeCameraRecordingEnabled, restoreWebKitPreviewAfterNativeRecording])

  useEffect(() => {
    if (!nativeCameraRecordingEnabledRef.current) {
      if (nativePreviewActiveRef.current) {
        void stopNativeVideoBridge()
      }
    }
  }, [nativeCameraRecordingEnabled, stopNativeVideoBridge])

  useEffect(() => {
    return () => {
      nativePreviewStartTokenRef.current += 1
      if (!nativePreviewActiveRef.current) return
      nativePreviewActiveRef.current = false
      void stopNativeCameraBridge()
    }
  }, [])

  const scheduleReleaseCameraState = useCallback(() => {
    cancelScheduledRelease()
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null
      forceClearCameraState()
    }, CAMERA_RELEASE_DELAY_MS)
  }, [cancelScheduledRelease, forceClearCameraState])

  const applyQueuedMicPreferenceBeforeAcquire = useCallback(
    async (reason: string, options?: { liveCapture?: boolean }) => {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return

      const basePreference = queuedMicPreferenceRef.current ?? micInputPreferenceRef.current
      const requestedPreference = options?.liveCapture
        ? resolveMicPreferenceForLiveCapture(basePreference)
        : basePreference

      console.info('[AudioRoute] applying queued mic preference before getUserMedia', {
        requestedMicPreference: requestedPreference,
        reason,
        liveCapture: options?.liveCapture ?? false,
      })

      await syncNativeCameraSessionState({
        previewActive: nativePreviewActiveRef.current,
        recordingActive: false,
      })
      await applyMicInputPreference(requestedPreference)
      queuedMicPreferenceRef.current = null
    },
    [],
  )

  useEffect(() => {
    queuedMicPreferenceRef.current = micInputPreference
    if (streamRef.current || readyRef.current || permissionRequestInFlightRef.current) return
    if (nativePreviewActiveRef.current) return
    void applyQueuedMicPreferenceBeforeAcquire('idle-no-preview')
  }, [applyQueuedMicPreferenceBeforeAcquire, micInputPreference])

  const acquireStream = useCallback(
    async (
      mode: RecordingMode,
      cancelled?: () => boolean,
      options?: { forceNew?: boolean; liveCapture?: boolean },
    ) => {
      const epoch = captureSessionEpochRef.current
      setError(null)

      if (mode === 'video' && isNativeVideoRecordingEnabled() && !options?.forceNew) {
        const warmed = await acquireNativeVideoBridge()
        return warmed ? streamRef.current : null
      }

      const existing = streamRef.current
      if (
        !options?.forceNew &&
        existing &&
        isStreamCompatibleForMode(existing, mode) &&
        !isCaptureSessionStale(epoch, mode, cancelled)
      ) {
        if (mode === 'video') {
          await normalizeReusableVideoPreview(existing, mode)
        }
        syncPreviewTargets(existing, mode)
        setNeedsPermission(false)
        setReady(true)
        return existing
      }

      if (isCaptureSessionStale(epoch, mode, cancelled)) {
        return null
      }

      stopStreamTracks(streamRef.current)
      streamRef.current = null
      detachAllPreviewTargets()

      const constraints = getMediaConstraints(mode)
      streamAcquireInFlightRef.current = true

      try {
        const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
        if (!getUserMedia) {
          console.warn('navigator.mediaDevices.getUserMedia is unavailable')
          setNeedsPermission(true)
          setReady(false)
          return null
        }

        await applyQueuedMicPreferenceBeforeAcquire(`acquire-${mode}`, {
          liveCapture: options?.liveCapture,
        })
        if (isCaptureSessionStale(epoch, mode, cancelled)) return null

        logGetUserMediaEvent('before', `useCameraSession.acquireStream.${mode}`, { constraints })
        const mediaStream = await getUserMedia(constraints)
        logGetUserMediaEvent('after', `useCameraSession.acquireStream.${mode}`, describeMediaStream(mediaStream))
        if (isCaptureSessionStale(epoch, mode, cancelled)) {
          mediaStream.getTracks().forEach((track) => track.stop())
          return null
        }

        await tuneMusicRecordingStream(mediaStream)
        if (isCaptureSessionStale(epoch, mode, cancelled)) {
          mediaStream.getTracks().forEach((track) => track.stop())
          return null
        }

        if (mode === 'video') {
          await maybeBoostTabletPreviewResolution(mediaStream)
          resetCameraPreviewZoom()
          await normalizeVideoPreviewAfterWake(mediaStream)
        }
        if (isCaptureSessionStale(epoch, mode, cancelled)) {
          mediaStream.getTracks().forEach((track) => track.stop())
          return null
        }

        streamRef.current = mediaStream
        syncPreviewTargets(mediaStream, mode)
        setStreamGeneration((generation) => generation + 1)
        setNeedsPermission(false)
        setReady(true)
        return mediaStream
      } catch (err) {
        if (!isCaptureSessionStale(epoch, mode, cancelled)) {
          console.warn('Failed to acquire camera/microphone stream', err)
          setNeedsPermission(true)
          setReady(false)
        }
        return null
      } finally {
        streamAcquireInFlightRef.current = false
        const queuedMode = queuedCaptureRequestModeRef.current
        queuedCaptureRequestModeRef.current = null
        if (queuedMode && !isRecordingRef.current) {
          window.setTimeout(() => requestCameraAccessRef.current?.(queuedMode), 0)
        }
      }
    },
    [
      acquireNativeVideoBridge,
      applyQueuedMicPreferenceBeforeAcquire,
      detachAllPreviewTargets,
      isCaptureSessionStale,
      isNativeVideoRecordingEnabled,
      normalizeReusableVideoPreview,
      stopStreamTracks,
      syncPreviewTargets,
    ],
  )

  const reacquireCaptureStream = useCallback(async () => {
    if (!isAppInForeground()) return
    if (isRecordingRef.current || resumeInFlightRef.current) return

    cancelScheduledRelease()
    releaseLiveStream()

    if (Capacitor.isNativePlatform()) {
      await new Promise((resolve) => window.setTimeout(resolve, IOS_CAMERA_RELEASE_DELAY_MS))
    }

    await acquireStream(recordingModeRef.current)
  }, [acquireStream, cancelScheduledRelease, releaseLiveStream])

  const requestCameraAccess = useCallback((requestedMode?: RecordingMode) => {
    const mode = requestedMode ?? recordingModeRef.current
    if (isRecordingRef.current) return

    const existing = streamRef.current
    if (existing && isStreamCompatibleForMode(existing, mode)) {
      if (mode === 'video') {
        void normalizeReusableVideoPreview(existing, mode).then(() => {
          if (streamRef.current === existing && recordingModeRef.current === mode) {
            syncPreviewTargets(existing, mode)
          }
        })
      }
      syncPreviewTargets(existing, mode)
      setNeedsPermission(false)
      setReady(true)
      return
    }

    if (permissionRequestInFlightRef.current || streamAcquireInFlightRef.current) {
      captureSessionEpochRef.current += 1
    }

    const epoch = captureSessionEpochRef.current

    const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
    if (!getUserMedia) {
      console.warn('navigator.mediaDevices.getUserMedia is unavailable')
      setNeedsPermission(true)
      setReady(false)
      return
    }

    stopStreamTracks(streamRef.current)
    streamRef.current = null
    detachAllPreviewTargets()

    const constraints = getMediaConstraints(mode)
    permissionRequestInFlightRef.current = true
    setPermissionRequestInFlight(true)
    setError(null)

    // iOS requires getUserMedia to start synchronously inside the tap handler.
    logGetUserMediaEvent('before', `useCameraSession.requestCameraAccess.${mode}`, { constraints })
    getUserMedia(constraints)
      .then(async (mediaStream) => {
        if (epoch !== captureSessionEpochRef.current) {
          stopStreamTracks(mediaStream)
          return
        }

        logGetUserMediaEvent('after', `useCameraSession.requestCameraAccess.${mode}`, describeMediaStream(mediaStream))
        await tuneMusicRecordingStream(mediaStream)
        if (epoch !== captureSessionEpochRef.current) {
          stopStreamTracks(mediaStream)
          return
        }

        if (mode === 'video') {
          await maybeBoostTabletPreviewResolution(mediaStream)
          resetCameraPreviewZoom()
          await normalizeVideoPreviewAfterWake(mediaStream)
        }
        if (epoch !== captureSessionEpochRef.current) {
          stopStreamTracks(mediaStream)
          return
        }

        streamRef.current = mediaStream
        syncPreviewTargets(mediaStream, mode)
        setStreamGeneration((generation) => generation + 1)
        setNeedsPermission(false)
        setReady(true)
      })
      .catch((err) => {
        if (epoch !== captureSessionEpochRef.current) {
          return
        }
        console.warn('Failed to acquire camera/microphone stream', err)
        setNeedsPermission(true)
        setReady(false)
      })
      .finally(() => {
        permissionRequestInFlightRef.current = false
        setPermissionRequestInFlight(false)
        const queuedMode = queuedCaptureRequestModeRef.current
        queuedCaptureRequestModeRef.current = null
        if (queuedMode && !isRecordingRef.current) {
          window.setTimeout(() => requestCameraAccessRef.current?.(queuedMode), 0)
        }
      })
  }, [detachAllPreviewTargets, normalizeReusableVideoPreview, stopStreamTracks, syncPreviewTargets])

  requestCameraAccessRef.current = requestCameraAccess

  const ensureRecordableStream = useCallback(async (): Promise<MediaStream | null> => {
    if (!isAppInForeground()) return null
    if (resumeInFlightRef.current) return streamRef.current

    const mode = recordingModeRef.current

    if (isNativeVideoRecordingEnabled() && mode === 'video') {
      if (nativePreviewActiveRef.current) {
        if (!readyRef.current) {
          setReady(true)
        }
        return streamRef.current
      }
      const warmed = await acquireNativeVideoBridge()
      return warmed ? streamRef.current : null
    }

    const stream = streamRef.current

    if (isStreamCompatibleForMode(stream, mode)) {
      if (mode === 'video') {
        await normalizeReusableVideoPreview(stream, mode)
      }
      if (!readyRef.current) {
        setReady(true)
      }
      return stream
    }

    try {
      return await acquireStream(mode)
    } catch {
      return null
    }
  }, [acquireNativeVideoBridge, acquireStream, isNativeVideoRecordingEnabled, normalizeReusableVideoPreview])

  ensureRecordableStreamRef.current = ensureRecordableStream

  useEffect(() => {
    let cancelled = false
    let activeStream: MediaStream | null = null

    const startWithRecovery = async () => {
      cancelScheduledRelease()

      const mode = recordingMode

      if (mode !== 'video' && nativePreviewActiveRef.current) {
        await stopNativeVideoBridge()
      }

      if (
        mode === 'video' &&
        nativeCameraRecordingEnabledRef.current &&
        Capacitor.isNativePlatform() &&
        Capacitor.getPlatform() === 'ios'
      ) {
        previousRecordingModeRef.current = mode
        const ok = await acquireNativeVideoBridge()
        if (cancelled) return
        if (ok) {
          previewHealthyRef.current = true
        }
        return
      }

      if (streamRef.current && isStreamCompatibleForMode(streamRef.current, mode)) {
        previousRecordingModeRef.current = mode
        if (mode === 'video') {
          await normalizeReusableVideoPreview(streamRef.current, mode)
        }
        syncPreviewTargets(streamRef.current, mode)
        setReady(true)
        activeStream = streamRef.current
        if (mode === 'video') {
          previewHealthyRef.current = isVideoPreviewHealthy(
            previewRef.current,
            streamRef.current,
            'video',
          )
        }
        return
      }

      if (permissionRequestInFlightRef.current) {
        return
      }

      const leavingAudioForVideo =
        previousRecordingModeRef.current === 'audio' && mode === 'video'
      const enteringAudioFromVideo =
        previousRecordingModeRef.current === 'video' && mode === 'audio'

      if (enteringAudioFromVideo && canSoftHandoffToAudio(streamRef.current)) {
        releaseVideoTracksOnly(streamRef.current)
        detachAllPreviewTargets()
        previousRecordingModeRef.current = mode
        setStreamGeneration((generation) => generation + 1)
        setReady(true)
        activeStream = streamRef.current
        return
      }

      await new Promise<void>((resolve) => {
        scheduleAfterPaint(() => resolve())
      })
      if (cancelled) return

      if (streamRef.current) {
        forceClearCameraState()
      }

      if (leavingAudioForVideo && Capacitor.isNativePlatform()) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, IOS_AUDIO_TO_VIDEO_DELAY_MS),
        )
        if (cancelled) return
      }

      if (enteringAudioFromVideo && Capacitor.isNativePlatform()) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, IOS_VIDEO_TO_AUDIO_DELAY_MS),
        )
        if (cancelled) return
      }

      previousRecordingModeRef.current = mode

      try {
        const mediaStream = await acquireStream(mode, () => cancelled)
        if (cancelled) {
          if (mediaStream) {
            stopStreamTracks(mediaStream)
          }
          return
        }
        activeStream = mediaStream
      } catch (err) {
        if (cancelled) return
        console.warn('Camera session initialization failed', err)
        setNeedsPermission(true)
        setReady(false)
      }
    }

    void startWithRecovery().catch(() => {
      /* startWithRecovery handles its own errors */
    })

    return () => {
      cancelled = true
      cancelScheduledRelease()
      void abortActiveWriter().catch(() => {})

      stopStreamTracks(activeStream)
      if (streamRef.current === activeStream) {
        streamRef.current = null
      }
      syncPreviewTargets(null, recordingMode)
      previewHealthyRef.current = false
      if (!nativePreviewActiveRef.current) {
        setReady(false)
      }
    }
  }, [
    abortActiveWriter,
    acquireNativeVideoBridge,
    acquireStream,
    cancelScheduledRelease,
    forceClearCameraState,
    nativeExperimentalAudioEnabled,
    nativeCameraRecordingEnabled,
    normalizeReusableVideoPreview,
    recordingMode,
    releaseLiveStream,
    stopNativeVideoBridge,
    stopStreamTracks,
  ])

  useEffect(() => {
    return () => {
      cancelScheduledRelease()
      scheduleReleaseCameraState()
    }
  }, [cancelScheduledRelease, scheduleReleaseCameraState])

  useEffect(() => {
    if (!isRecording) return
    const interval = window.setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1
        elapsedRef.current = next
        return next
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isRecording])

  const bindRecordingHandlers = useCallback(
    (recorder: MediaRecorder, takeId: string) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return

        if (writerRef.current) {
          void writerRef.current.enqueue(event.data).catch(async () => {
            await abortActiveWriter().catch(() => {})
            if (recorderRef.current?.state === 'recording') {
              recorderRef.current.stop()
            }
          })
          return
        }

        chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        void (async () => {
          const shouldSaveTake =
            !autoPreRollActiveRef.current || autoPerformanceActiveRef.current
          const preRollStartedAt = autoPreRollStartedAtRef.current
          const performanceStartedAt = autoPerformanceStartedAtRef.current
          autoPreRollActiveRef.current = false
          autoPerformanceActiveRef.current = false
          autoPreRollStartedAtRef.current = 0
          autoPerformanceStartedAtRef.current = 0
          isRecordingRef.current = false

          const recorderInstance = recorderRef.current
          if (recorderInstance) {
            detachRecorder(recorderInstance)
          }
          recorderRef.current = null

          const capturedChunks = [...chunksRef.current]
          chunksRef.current = []

          const activeWriter = writerRef.current
          writerRef.current = null
          const stoppedTakeId = activeTakeIdRef.current ?? takeId
          activeTakeIdRef.current = null
          const completedMode = recordingModeRef.current
          const durationSeconds =
            preRollStartedAt > 0
              ? Math.max(0.1, (performance.now() - preRollStartedAt) / 1000)
              : elapsedRef.current
          const autoPerformanceStartSeconds =
            preRollStartedAt > 0 && performanceStartedAt > preRollStartedAt
              ? Math.max(0, (performanceStartedAt - preRollStartedAt) / 1000)
              : undefined
          const captureTrackSnapshot: RecordingTrackSnapshot | null =
            snapshotCaptureAudioTrack(
              streamRef.current?.getAudioTracks().find((t) => t.readyState === 'live') ??
                null,
            )
          const captureProfile = getActiveCaptureProfile()

          try {
            if (!shouldSaveTake) {
              if (activeWriter) {
                await activeWriter.abort().catch(() => {})
              }
              return
            }

            if (activeWriter) {
              const persisted = await activeWriter.finalize()
              onCompleteRef.current({
                takeId: stoppedTakeId,
                mimeType: recorderMimeTypeRef.current,
                mediaType: completedMode,
                filePath: persisted.filePath,
                videoUrl: persisted.videoUrl,
                durationSeconds,
                recordingOrientation: recordingOrientationRef.current,
                captureProfile,
                captureTrackSnapshot,
                autoPerformanceStartSeconds,
              })
            } else {
              const blob = composeBufferedRecordingBlob(
                capturedChunks as Blob[],
                recorderMimeTypeRef.current,
              )
              const persisted = await persistRecordingBlob(
                blob,
                stoppedTakeId,
                recorderMimeTypeRef.current,
              )
              onCompleteRef.current({
                takeId: stoppedTakeId,
                mimeType: recorderMimeTypeRef.current,
                mediaType: completedMode,
                filePath: persisted.filePath,
                videoUrl: persisted.videoUrl,
                durationSeconds,
                recordingOrientation: recordingOrientationRef.current,
                blob,
                captureProfile,
                captureTrackSnapshot,
                autoPerformanceStartSeconds,
              })
            }
          } catch {
            if (activeWriter) {
              await activeWriter.abort().catch(() => {})
            }
          } finally {
            releaseRecorderStream(recordStreamRef.current, streamRef.current)
            recordStreamRef.current = null
            setIsRecording(false)
            scheduleWarmAutoAudioRef.current()
          }
        })().catch(() => {
          releaseRecorderStream(recordStreamRef.current, streamRef.current)
          recordStreamRef.current = null
          setIsRecording(false)
        })
      }

      recorder.onerror = () => {
        chunksRef.current = []
        void abortActiveWriter().catch(() => {})
        releaseRecorderStream(recordStreamRef.current, streamRef.current)
        recordStreamRef.current = null
        if (recorderRef.current) {
          detachRecorder(recorderRef.current)
        }
        recorderRef.current = null
        autoPerformanceStartedAtRef.current = 0
        setIsRecording(false)
      }
    },
    [abortActiveWriter],
  )

  const cancelAutoPreRollCapture = useCallback(() => {
    if (!autoPreRollActiveRef.current || autoPerformanceActiveRef.current) return

    const recorder = recorderRef.current
    if (recorder?.state === 'recording') {
      recorder.stop()
      return
    }

    autoPreRollActiveRef.current = false
    autoPreRollStartedAtRef.current = 0
    autoPerformanceStartedAtRef.current = 0
    const writer = writerRef.current
    writerRef.current = null
    activeTakeIdRef.current = null
    if (writer) {
      void writer.abort().catch(() => {})
    }
    if (recorder) {
      detachRecorder(recorder)
    }
    recorderRef.current = null
    releaseRecorderStream(recordStreamRef.current, streamRef.current)
    recordStreamRef.current = null
  }, [])

  const disarmAutoAudioRecorder = useCallback(async () => {
    if (autoAudioDisarmInFlightRef.current) {
      await autoAudioDisarmInFlightRef.current
      return
    }

    if (autoPreRollActiveRef.current && !autoPerformanceActiveRef.current) {
      cancelAutoPreRollCapture()
      return
    }

    const armed = armedAutoAudioRef.current
    armedAutoAudioRef.current = null
    if (!armed) return

    detachRecorder(armed.recorder)

    const disarmTask = (async () => {
      try {
        await armed.writer.abort()
      } catch {
        /* ignore — abort is best-effort */
      }
    })()

    autoAudioDisarmInFlightRef.current = disarmTask
    try {
      await disarmTask
    } finally {
      if (autoAudioDisarmInFlightRef.current === disarmTask) {
        autoAudioDisarmInFlightRef.current = null
      }
    }
  }, [cancelAutoPreRollCapture])

  const beginAutoPreRollCapture = useCallback(
    (armed: NonNullable<typeof armedAutoAudioRef.current>) => {
      armedAutoAudioRef.current = null
      recorderRef.current = armed.recorder
      writerRef.current = armed.writer
      activeTakeIdRef.current = armed.takeId
      recorderMimeTypeRef.current = armed.mimeType
      chunksRef.current = []

      try {
        if (shouldUseRecordingTimeslice(armed.mimeType)) {
          armed.recorder.start(RECORDING_TIMESLICE_MS)
        } else {
          armed.recorder.start()
        }
        autoPreRollActiveRef.current = true
        autoPerformanceActiveRef.current = false
        autoPreRollStartedAtRef.current = performance.now()
        autoPerformanceStartedAtRef.current = 0
        recordStreamRef.current = buildRecorderStream(
          streamRef.current!,
          recordingModeRef.current,
        )
      } catch {
        autoPreRollActiveRef.current = false
        autoPreRollStartedAtRef.current = 0
        autoPerformanceStartedAtRef.current = 0
        recorderRef.current = null
        writerRef.current = null
        activeTakeIdRef.current = null
        void armed.writer.abort().catch(() => {})
      }
    },
    [],
  )

  const tryMarkAutoPerformanceStart = useCallback((): 'started' | 'pending' | 'unavailable' => {
    if (autoPerformanceActiveRef.current || isRecordingRef.current) {
      return 'started'
    }
    if (!autoPreRollActiveRef.current) {
      return 'unavailable'
    }

    const elapsed = performance.now() - autoPreRollStartedAtRef.current
    if (elapsed < AUTO_RECORD_PREROLL_MS) {
      return 'pending'
    }

    autoPerformanceActiveRef.current = true
    autoPerformanceStartedAtRef.current = performance.now()
    isRecordingRef.current = true
    setIsRecording(true)
    setElapsed(0)
    elapsedRef.current = 0
    return 'started'
  }, [])

  const warmAutoAudioRecorder = useCallback(async () => {
    if (
      recordingModeRef.current !== 'audio' ||
      isRecordingRef.current ||
      autoPreRollActiveRef.current ||
      warmAutoAudioInFlightRef.current ||
      isAutoPlaybackHoldingMicWarmup()
    ) {
      return
    }

    warmAutoAudioInFlightRef.current = true
    try {
      const stream = await ensureRecordableStream()
      if (
        !stream ||
        recordingModeRef.current !== 'audio' ||
        isRecordingRef.current ||
        autoPreRollActiveRef.current
      ) {
        return
      }

      const takeId = crypto.randomUUID()
      const mimeType = getRecorderMimeTypeForMode('audio')
      const writer = await StreamingTakeWriter.open(takeId, mimeType)
      if (!writer) return

      if (
        isRecordingRef.current ||
        recordingModeRef.current !== 'audio' ||
        autoPreRollActiveRef.current
      ) {
        await writer.abort().catch(() => {})
        return
      }

      const recorder = createMediaRecorder(stream, mimeType)
      bindRecordingHandlers(recorder, takeId)

      beginAutoPreRollCapture({ recorder, writer, takeId, mimeType })
    } catch {
      /* cold start on trigger if warm fails */
    } finally {
      warmAutoAudioInFlightRef.current = false
    }
  }, [beginAutoPreRollCapture, bindRecordingHandlers, ensureRecordableStream])

  const restartAutoPreRollCapture = useCallback(() => {
    if (!autoPreRollActiveRef.current || autoPerformanceActiveRef.current) return
    cancelAutoPreRollCapture()
    window.setTimeout(() => {
      void warmAutoAudioRecorder()
    }, 120)
  }, [cancelAutoPreRollCapture, warmAutoAudioRecorder])

  scheduleWarmAutoAudioRef.current = () => {
    if (recordingModeRef.current !== 'audio') return
    if (isAutoPlaybackHoldingMicWarmup()) {
      return
    }
    window.setTimeout(() => {
      void warmAutoAudioRecorder()
    }, 200)
  }

  const shouldUseNativeExperimentalRecording = useCallback(
    () =>
      isNativeVideoRecordingEnabled() && recordingModeRef.current === 'video',
    [isNativeVideoRecordingEnabled],
  )

  const recoverAfterNativeExperimentalFailure = useCallback(() => {
    // While the multitrack stage owns the bridge, a failed take must not tear
    // down the live preview — just reset flags and let the stage recover.
    if (suppressBridgeRecoveryRef.current) return
    void restoreWebKitPreviewAfterNativeRecording()
  }, [restoreWebKitPreviewAfterNativeRecording])

  const setSuppressNativeBridgeRecovery = useCallback((on: boolean) => {
    suppressBridgeRecoveryRef.current = on
  }, [])

  /**
   * Starts native recording and resolves true only once AVCaptureMovieFileOutput
   * has actually begun writing (didStartRecording). The settle promise is kept in
   * nativeStartSettleRef so a Stop issued during the start window can wait it out
   * instead of racing native state — the root cause of the multitrack
   * "second box freezes everything" wedge.
   */
  const startNativeExperimentalRecording = useCallback((): Promise<boolean> => {
    if (isRecordingRef.current) return Promise.resolve(true)

    const settle = (async (): Promise<boolean> => {
      const takeId = crypto.randomUUID()
      activeTakeIdRef.current = takeId
      recordingOrientationRef.current = readRecordingOrientation()
      recorderMimeTypeRef.current = 'video/mp4'

      if (!nativePreviewActiveRef.current) {
        const warmed = await acquireNativeVideoBridge()
        if (!warmed) {
          throw new Error('native camera bridge unavailable')
        }
      }

      nativeExperimentalRecordingRef.current = true
      isRecordingRef.current = true
      flushSync(() => {
        setIsRecording(true)
        setElapsed(0)
        elapsedRef.current = 0
      })

      suspendSharedMicForNativeRecording()

      const result = await startNativeCameraRecording({
        useFrontCamera: true,
        audioSessionProfile: 'videoRecording',
        micInputPreference: micInputPreferenceRef.current,
      })

      if (!result) {
        throw new Error('native recording did not start')
      }
      return true
    })()

    const settledSafe = settle.catch((error) => {
      console.warn('[NativeExperimentalAudio] native recording start failed', error)
      activeTakeIdRef.current = null
      nativeExperimentalRecordingRef.current = false
      isRecordingRef.current = false
      setIsRecording(false)
      nativeStartSettleRef.current = null
      recoverAfterNativeExperimentalFailure()
      return false
    })
    nativeStartSettleRef.current = settledSafe
    return settledSafe
  }, [
    acquireNativeVideoBridge,
    recoverAfterNativeExperimentalFailure,
    suspendSharedMicForNativeRecording,
  ])

  const stopNativeExperimentalRecording = useCallback((options?: MultitrackRecordingStopOptions) => {
    setIsStopping(true)

    void (async () => {
      let timelineOffsetMs: number | undefined
      if (options?.timelineOffsetMs !== undefined) {
        timelineOffsetMs = Math.round(options.timelineOffsetMs)
        console.log(`[useCameraSession] beat-based timelineOffsetMs=${timelineOffsetMs}`)
      } else if (options?.rawOffsetMs !== undefined) {
        const rtlMs = await getAudioHardwareRtl()
        timelineOffsetMs = Math.round(options.rawOffsetMs - rtlMs)
        console.log(`[useCameraSession] rawOffsetMs=${options.rawOffsetMs} rtlMs=${rtlMs} timelineOffsetMs=${timelineOffsetMs}`)
      }
      // Serialize against an in-flight start: AVCaptureMovieFileOutput rejects
      // stop() until didStartRecording fires (~0.5-1s). Stopping inside that
      // window used to orphan the native recording and wedge every later take.
      const startSettle = nativeStartSettleRef.current
      if (startSettle) {
        const started = await startSettle
        nativeStartSettleRef.current = null
        if (!started) {
          // Start failed — its catch path already reset all flags.
          setIsRecording(false)
          setIsStopping(false)
          return
        }
      }

      if (!nativeExperimentalRecordingRef.current) {
        setIsRecording(false)
        setIsStopping(false)
        return
      }
      nativeExperimentalRecordingRef.current = false

      const stoppedTakeId = activeTakeIdRef.current ?? crypto.randomUUID()
      activeTakeIdRef.current = null

      const result = await stopNativeCameraRecording()
      isRecordingRef.current = false
      setIsRecording(false)

      if (!result) {
        recoverAfterNativeExperimentalFailure()
        setIsStopping(false)
        return
      }

      const videoUrl = Capacitor.convertFileSrc(result.fileURL)
      let captureDiagnostics: RecordingCaptureDiagnostics | undefined
      const peakDb = result.recordedPeakDb
      const activeRmsDb = result.recordedActiveRmsDb ?? result.recordedRmsDb
      if (peakDb != null && activeRmsDb != null) {
        const levels = {
          recordedPeakDb: peakDb,
          recordedActiveRmsDb: activeRmsDb,
          leftChannelRmsDb: null,
          rightChannelRmsDb: null,
          channelCount: 1,
        }
        captureDiagnostics = {
          captureProfile: getActiveCaptureProfile(),
          trackSnapshot: null,
          levels,
          playbackGainMetadata: computePlaybackGainMetadata(levels),
        }
      }

      onCompleteRef.current({
        takeId: stoppedTakeId,
        mimeType: result.mimeType,
        mediaType: 'video',
        filePath: result.filePath,
        videoUrl,
        durationSeconds: Math.max(0.1, result.duration || elapsedRef.current),
        timelineOffsetMs,
        recordingBpm: options?.recordingBpm,
        performanceStartBeats: options?.performanceStartBeats,
        performanceStartOffsetBeats: options?.performanceStartOffsetBeats,
        referenceTrackId: options?.referenceTrackId,
        referenceStartBeat: options?.referenceStartBeat,
        recordingOrientation: recordingOrientationRef.current,
        // Native AVCaptureMovieFileOutput is unmirrored (see
        // NativeCameraRecordingEngine.configureCaptureSession) to match the
        // unmirrored live frame-bridge preview — don't re-mirror on playback.
        mirrorPlayback: false,
        captureProfile: getActiveCaptureProfile(),
        captureTrackSnapshot: null,
        captureDiagnostics,
      })
      setIsStopping(false)
    })().catch((error) => {
      console.warn('[NativeExperimentalAudio] native recording stop failed', error)
      isRecordingRef.current = false
      activeTakeIdRef.current = null
      nativeExperimentalRecordingRef.current = false
      setIsRecording(false)
      setIsStopping(false)
      recoverAfterNativeExperimentalFailure()
    })
  }, [recoverAfterNativeExperimentalFailure])

  /** Resolves true once recording has actually started (native: didStartRecording confirmed). */
  const startRecording = useCallback((): Promise<boolean> => {
    if (isRecordingRef.current) return Promise.resolve(true)

    if (shouldUseNativeExperimentalRecording()) {
      return startNativeExperimentalRecording()
    }

    if (autoPreRollActiveRef.current && !autoPerformanceActiveRef.current) {
      autoPerformanceActiveRef.current = true
      isRecordingRef.current = true
      setIsRecording(true)
      setElapsed(0)
      elapsedRef.current = 0
      return Promise.resolve(true)
    }

    return (async () => {
      const currentStream = await ensureRecordableStream()
      if (!currentStream || isRecordingRef.current) return isRecordingRef.current

      const takeId = crypto.randomUUID()
      const mode = recordingModeRef.current
      recordingOrientationRef.current = readRecordingOrientation()
      const mimeType = getRecorderMimeTypeForMode(mode)
      recorderMimeTypeRef.current = mimeType
      chunksRef.current = []

      let writer: StreamingTakeWriter | null = null
      try {
        writer = await StreamingTakeWriter.open(takeId, mimeType)
        if (!writer) {
          throw new Error('Recording writer unavailable')
        }
        writerRef.current = writer
        activeTakeIdRef.current = takeId

        const recordStream = buildRecorderStream(currentStream, mode)
        const recorder = createMediaRecorder(recordStream, mimeType)
        recorderRef.current = recorder
        bindRecordingHandlers(recorder, takeId)
        recordStreamRef.current = recordStream

        if (shouldUseRecordingTimeslice(mimeType)) {
          recorder.start(RECORDING_TIMESLICE_MS)
        } else {
          recorder.start()
        }

        isRecordingRef.current = true
        setIsRecording(true)
        setElapsed(0)
        elapsedRef.current = 0
        return true
      } catch {
        chunksRef.current = []
        const activeRecorder = recorderRef.current
        if (activeRecorder && activeRecorder.state === 'recording') {
          try {
            activeRecorder.stop()
          } catch {
            /* already stopping */
          }
        }
        await writer?.abort().catch(() => {})
        writerRef.current = null
        activeTakeIdRef.current = null
        recorderRef.current = null
        releaseRecorderStream(recordStreamRef.current, streamRef.current)
        recordStreamRef.current = null
        isRecordingRef.current = false
        setIsRecording(false)
        return false
      }
    })().catch(() => {
      chunksRef.current = []
      releaseRecorderStream(recordStreamRef.current, streamRef.current)
      recordStreamRef.current = null
      isRecordingRef.current = false
      setIsRecording(false)
      return false
    })
  }, [
    bindRecordingHandlers,
    ensureRecordableStream,
    shouldUseNativeExperimentalRecording,
    startNativeExperimentalRecording,
  ])

  const startAutoAudioRecording = useCallback(() => {
    const preRollMark = tryMarkAutoPerformanceStart()
    if (preRollMark === 'started' || preRollMark === 'pending') {
      return
    }

    if (isRecordingRef.current) return

    const armed = armedAutoAudioRef.current
    if (armed?.recorder.state === 'inactive') {
      armedAutoAudioRef.current = null
      recorderRef.current = armed.recorder
      writerRef.current = armed.writer
      activeTakeIdRef.current = armed.takeId
      recorderMimeTypeRef.current = armed.mimeType
      chunksRef.current = []

      try {
        if (shouldUseRecordingTimeslice(armed.mimeType)) {
          armed.recorder.start(RECORDING_TIMESLICE_MS)
        } else {
          armed.recorder.start()
        }
        isRecordingRef.current = true
        recordStreamRef.current = buildRecorderStream(
          streamRef.current!,
          recordingModeRef.current,
        )
        setIsRecording(true)
        setElapsed(0)
        elapsedRef.current = 0
        return
      } catch {
        void disarmAutoAudioRecorder()
        void warmAutoAudioRecorder()
      }
    }

    startRecording()
  }, [
    disarmAutoAudioRecorder,
    startRecording,
    tryMarkAutoPerformanceStart,
    warmAutoAudioRecorder,
  ])

  const startAutoRecording = useCallback(() => {
    if (recordingModeRef.current === 'audio') {
      startAutoAudioRecording()
      return
    }

    startRecording()
  }, [startAutoAudioRecording, startRecording])

  const warmAutoRecording = useCallback(async () => {
    if (!isAppInForeground()) return

    if (recordingModeRef.current === 'audio') {
      await warmAutoAudioRecorder()
      return
    }

    await ensureRecordableStream()
  }, [ensureRecordableStream, warmAutoAudioRecorder])

  const disarmAutoRecording = useCallback(async () => {
    if (recordingModeRef.current === 'audio') {
      await disarmAutoAudioRecorder()
    }
  }, [disarmAutoAudioRecorder])

  const stopRecording = useCallback((options?: MultitrackRecordingStopOptions) => {
    // Route to the serialized native stop when a native recording is active OR
    // a native start is still settling (bridge warm / didStartRecording window)
    // — that stop path awaits the settle, so Stop is safe at any instant.
    if (nativeExperimentalRecordingRef.current || nativeStartSettleRef.current) {
      stopNativeExperimentalRecording(options)
      return
    }

    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false)
      return
    }

    const mimeType = recorderMimeTypeRef.current
    // iOS/mp4 records as a single blob — requestData() emits an extra fMP4 fragment
    // that breaks mux timing when concatenated (A/V drift on longer takes).
    if (shouldUseRecordingTimeslice(mimeType)) {
      try {
        if (recorder.state === 'recording') {
          recorder.requestData()
        }
      } catch {
        /* requestData may throw if already stopping */
      }
    } else {
    }

    recorder.stop()
  }, [stopNativeExperimentalRecording])

  const interruptRecordingForBackground = useCallback(() => {
    if (!isRecordingRef.current && !autoPreRollActiveRef.current) return

    if (autoPreRollActiveRef.current && !autoPerformanceActiveRef.current && !isRecordingRef.current) {
      cancelAutoPreRollCapture()
      return
    }

    if (nativeExperimentalRecordingRef.current) {
      stopNativeExperimentalRecording()
      return
    }

    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        if (recorderRef.current) {
          detachRecorder(recorderRef.current)
        }
        recorderRef.current = null
      }
    } else if (recorder) {
      detachRecorder(recorder)
      recorderRef.current = null
    }

    autoPreRollActiveRef.current = false
    autoPerformanceActiveRef.current = false
    autoPreRollStartedAtRef.current = 0
    autoPerformanceStartedAtRef.current = 0
    isRecordingRef.current = false
    setIsRecording(false)
  }, [cancelAutoPreRollCapture, stopNativeExperimentalRecording])

  const toggleRecording = useCallback(() => {
    // Gate on the ref, not the async React state: audio recording starts inside
    // an async IIFE, so isRecordingRef flips true before the isRecording state
    // commits. Using the stale state here caused a "stop" tap to be read as a
    // second "start" and silently no-op — the reported audio stop failure.
    if (isRecordingRef.current || nativeExperimentalRecordingRef.current || nativeStartSettleRef.current) {
      stopRecording()
    } else {
      void startRecording()
    }
  }, [startRecording, stopRecording])

  const changeRecordingMode = useCallback(
    (mode: RecordingMode) => {
      if (isRecording || mode === recordingModeRef.current) return

      cancelScheduledRelease()
      setError(null)
      captureSessionEpochRef.current += 1

      const softAudioHandoff =
        mode === 'audio' && canSoftHandoffToAudio(streamRef.current)

      if (softAudioHandoff) {
        releaseVideoTracksOnly(streamRef.current)
        detachAllPreviewTargets()
        previewHealthyRef.current = false
      } else {
        stopStreamTracks(streamRef.current)
        streamRef.current = null
        previewHealthyRef.current = false
        detachAllPreviewTargets()
      }

      recordingModeRef.current = mode

      if (mode === 'audio' && nativePreviewActiveRef.current) {
        void stopNativeVideoBridge()
      }

      if (!softAudioHandoff) {
        setReady(false)
      }
      setStreamGeneration((generation) => generation + 1)
      setRecordingMode(mode)
    },
    [cancelScheduledRelease, detachAllPreviewTargets, isRecording, stopNativeVideoBridge, stopStreamTracks],
  )

  const suspendCameraForBackground = useCallback(() => {
    interruptRecordingForBackground()
    captureSessionEpochRef.current += 1
    cancelScheduledRelease()
    if (autoPreRollActiveRef.current && !autoPerformanceActiveRef.current) {
      cancelAutoPreRollCapture()
    }
    releaseAllLiveMicPitchGraphs()
    void disarmAutoRecording()
    resetCameraPreviewZoom()
    releaseLiveStream()
    setNativeLivePreviewActive(false)
    setNativeLivePreviewSeedUrl(null)
    if (nativePreviewActiveRef.current) {
      nativePreviewActiveRef.current = false
      void stopNativeCameraBridge()
    }
    void syncNativeCameraSessionState({
      previewActive: false,
      recordingActive: false,
    })
  }, [
    cancelAutoPreRollCapture,
    cancelScheduledRelease,
    disarmAutoRecording,
    interruptRecordingForBackground,
    releaseLiveStream,
  ])

  const restartCameraAfterForeground = useCallback(async (options: { force?: boolean } = {}) => {
    if (document.visibilityState === 'hidden' && !isAppInForeground()) return
    if (options.force) {
      clearStaleCaptureStartState()
    }
    if (isRecordingRef.current || resumeInFlightRef.current || streamAcquireInFlightRef.current) {
      if (import.meta.env.DEV) {
        console.log('[CameraPreview] resume skipped: already starting')
      }
      return
    }

    const restartMode = recordingModeRef.current

    // Fast path: native camera already believes it's live — this is the
    // overwhelmingly common case on every foreground swipe-in. Never flip the
    // "recovering" placeholder for it; that dark overlay fading in and out
    // almost instantly is itself the flicker users notice. Just fire the
    // cheap, idempotent native health check in the background and bail.
    if (isNativeVideoRecordingEnabled() && restartMode === 'video' && nativePreviewActiveRef.current) {
      void ensureNativeCameraSessionHealthy()
      onBeforeForegroundRestartRef.current?.()
      onAfterForegroundRestartRef.current?.()
      return
    }

    const restartToken = ++foregroundRestartTokenRef.current
    resumeInFlightRef.current = true
    setIsPreviewRecovering(true)
    if (!nativePreviewActiveRef.current) {
      setReady(false)
    }
    cancelScheduledRelease()

    const resumeTimeoutId = window.setTimeout(() => {
      if (restartToken === foregroundRestartTokenRef.current) {
        resumeInFlightRef.current = false
        setIsPreviewRecovering(false)
      }
    }, RESUME_IN_FLIGHT_TIMEOUT_MS)

    try {
      applyViewportCssVarsOnResume()
      resetCameraPreviewZoom()
      captureSessionEpochRef.current += 1

      const mode = recordingModeRef.current

      if (isNativeVideoRecordingEnabled() && mode === 'video') {
        if (!nativePreviewActiveRef.current) {
          releaseLiveStream()
          if (Capacitor.isNativePlatform()) {
            await new Promise((resolve) => window.setTimeout(resolve, IOS_CAMERA_RELEASE_DELAY_MS))
          }
          if (restartToken !== foregroundRestartTokenRef.current) return
          await acquireNativeVideoBridge()
        }
        onBeforeForegroundRestartRef.current?.()
        return
      }

      releaseLiveStream()

      const preferFullReacquire = mode === 'video' && Capacitor.isNativePlatform()

      if (
        !preferFullReacquire &&
        isStreamRecordable(streamRef.current, mode) &&
        ensureCameraPreviewActive()
      ) {
        if (import.meta.env.DEV) {
          console.log('[CameraPreview] resume skipped: already active')
        }
        onBeforeForegroundRestartRef.current?.()
        return
      }

      if (Capacitor.isNativePlatform()) {
        await new Promise((resolve) => window.setTimeout(resolve, IOS_CAMERA_RELEASE_DELAY_MS))
      }
      if (restartToken !== foregroundRestartTokenRef.current) return

      onBeforeForegroundRestartRef.current?.()

      const stream = await acquireStream(recordingModeRef.current, undefined, {
        forceNew: true,
      })
      if (restartToken !== foregroundRestartTokenRef.current) return
      if (recordingModeRef.current === 'video' && stream) {
        await normalizeVideoPreviewAfterWake(stream)
        syncPreviewTargets(stream, 'video')
      }
    } catch (err) {
      console.warn('Camera interrupted during foreground restart', err)
      setNeedsPermission(true)
      if (!nativePreviewActiveRef.current) {
        setReady(false)
      }
    } finally {
      window.clearTimeout(resumeTimeoutId)
      if (restartToken === foregroundRestartTokenRef.current) {
        resumeInFlightRef.current = false
        setIsPreviewRecovering(false)
      }
      onAfterForegroundRestartRef.current?.()
    }
  }, [
    acquireNativeVideoBridge,
    acquireStream,
    cancelScheduledRelease,
    clearStaleCaptureStartState,
    ensureCameraPreviewActive,
    isNativeVideoRecordingEnabled,
    releaseLiveStream,
    syncPreviewTargets,
  ])

  const scheduleForegroundRecovery = useCallback(() => {
    if (backgroundSuspendTimerRef.current !== null) {
      window.clearTimeout(backgroundSuspendTimerRef.current)
      backgroundSuspendTimerRef.current = null
    }

    if (foregroundRestartTimerRef.current !== null) {
      window.clearTimeout(foregroundRestartTimerRef.current)
      foregroundRestartTimerRef.current = null
    }

    const runRecovery = () => {
      foregroundRestartTimerRef.current = null
      void restartCameraAfterForeground({ force: true })
    }

    const nativeVideoWake =
      Capacitor.isNativePlatform() && recordingModeRef.current === 'video'

    if (nativeVideoWake) {
      runRecovery()
      return
    }

    foregroundRestartTimerRef.current = window.setTimeout(
      runRecovery,
      FOREGROUND_RESTART_DELAY_MS,
    )
  }, [restartCameraAfterForeground])

  const scheduleBackgroundSuspend = useCallback(() => {
    if (foregroundRestartTimerRef.current !== null) {
      window.clearTimeout(foregroundRestartTimerRef.current)
      foregroundRestartTimerRef.current = null
    }
    foregroundRestartTokenRef.current += 1

    if (backgroundSuspendTimerRef.current !== null) {
      window.clearTimeout(backgroundSuspendTimerRef.current)
    }

    if (BACKGROUND_SUSPEND_DELAY_MS <= 0) {
      backgroundSuspendTimerRef.current = null
      suspendCameraForBackground()
      return
    }

    backgroundSuspendTimerRef.current = window.setTimeout(() => {
      backgroundSuspendTimerRef.current = null
      suspendCameraForBackground()
    }, BACKGROUND_SUSPEND_DELAY_MS)
  }, [suspendCameraForBackground])

  const logCameraPreview = useCallback((message: string) => {
    if (!import.meta.env.DEV) return
    console.log(`[CameraPreview] ${message}`)
  }, [])

  const requestCameraPreviewResume = useCallback(
    async (reason = 'unknown') => {
      if (!isAppInForeground()) return
      if (recordingModeRef.current !== 'video') return

      if (streamAcquireInFlightRef.current || resumeInFlightRef.current) {
        logCameraPreview('resume skipped: already starting')
        return
      }

      if (
        previewHealthyRef.current &&
        isVideoPreviewHealthy(previewRef.current, streamRef.current, 'video')
      ) {
        logCameraPreview('resume skipped: already active')
        return
      }

      if (ensureCameraPreviewActive()) {
        logCameraPreview('resume skipped: already active')
        return
      }

      logCameraPreview('resume requested')

      try {
        await restartCameraAfterForeground()

        if (ensureCameraPreviewActive()) {
          logCameraPreview('live preview restored')
        } else {
          console.warn(`[CameraPreview] resume failed (${reason})`)
        }
      } catch (err) {
        console.warn(`[CameraPreview] resume failed (${reason})`, err)
      }
    },
    [
      ensureCameraPreviewActive,
      logCameraPreview,
      restartCameraAfterForeground,
    ],
  )

  const refreshCameraSession = useCallback(async () => {
    if (!isAppInForeground()) return
    if (isRecordingRef.current || resumeInFlightRef.current || streamAcquireInFlightRef.current) {
      return
    }

    cancelScheduledRelease()
    applyViewportCssVarsOnResume()

    const mode = recordingModeRef.current

    if (isNativeVideoRecordingEnabled() && mode === 'video') {
      if (nativePreviewActiveRef.current) {
        previewHealthyRef.current = true
        await ensureNativeCameraSessionHealthy()
        return
      }
      await acquireNativeVideoBridge()
      return
    }

    const stream = streamRef.current

    if (!isStreamRecordable(stream, mode)) {
      await restartCameraAfterForeground()
      return
    }

    if (ensureCameraPreviewActive()) {
      return
    }

    await restartCameraAfterForeground()
  }, [
    acquireNativeVideoBridge,
    cancelScheduledRelease,
    ensureCameraPreviewActive,
    isNativeVideoRecordingEnabled,
    restartCameraAfterForeground,
  ])

  const recoverCameraPreviewLayout = useCallback(
    async (_reason = 'layout-change') => {
      if (!isAppInForeground()) return
      if (recordingModeRef.current !== 'video') return
      if (isRecordingRef.current) return

      applyViewportCssVarsOnResume()
      resetCameraPreviewZoom()

      const stream = streamRef.current
      if (!stream || !isStreamRecordable(stream, 'video')) return

      await normalizeVideoPreviewAfterWake(stream)
      if (recordingModeRef.current !== 'video' || streamRef.current !== stream) return

      syncPreviewTargets(stream, 'video')
      previewHealthyRef.current = isVideoPreviewHealthy(
        previewRef.current,
        stream,
        'video',
      )
    },
    [syncPreviewTargets],
  )

  useEffect(() => {
    let firstTimer: number | null = null
    let secondTimer: number | null = null

    const clearTimers = () => {
      if (firstTimer !== null) {
        window.clearTimeout(firstTimer)
        firstTimer = null
      }
      if (secondTimer !== null) {
        window.clearTimeout(secondTimer)
        secondTimer = null
      }
    }

    const onRecovery = (event: Event) => {
      clearTimers()
      const reason =
        event instanceof CustomEvent && typeof event.detail?.reason === 'string'
          ? event.detail.reason
          : 'layout-change'

      resetCameraPreviewZoom()
      firstTimer = window.setTimeout(() => {
        void recoverCameraPreviewLayout(reason)
      }, 80)
      secondTimer = window.setTimeout(() => {
        void recoverCameraPreviewLayout(`${reason}:settled`)
      }, 320)
    }

    window.addEventListener(CAMERA_PREVIEW_LAYOUT_RECOVERY_EVENT, onRecovery)

    return () => {
      clearTimers()
      window.removeEventListener(CAMERA_PREVIEW_LAYOUT_RECOVERY_EVENT, onRecovery)
    }
  }, [recoverCameraPreviewLayout])

  /** Re-open getUserMedia after AVAudioSession route changes (e.g. device mic vs BT HFP). */
  const reacquireStreamForAudioRoute = useCallback(
    async (options?: { liveCapture?: boolean }) => {
      if (isRecordingRef.current || resumeInFlightRef.current) return

      if (isNativeVideoRecordingEnabled() && recordingModeRef.current === 'video') {
        await applyMicInputPreference(micInputPreferenceRef.current)
        return
      }

      cancelScheduledRelease()
      releaseLiveStream()

      if (Capacitor.isNativePlatform()) {
        await new Promise((resolve) => window.setTimeout(resolve, IOS_CAMERA_RELEASE_DELAY_MS))
      }

      await acquireStream(recordingModeRef.current, undefined, {
        liveCapture: options?.liveCapture,
      })
    },
    [acquireStream, cancelScheduledRelease, isNativeVideoRecordingEnabled, releaseLiveStream],
  )

  const suspendMicForPlayback = useCallback(async () => {
    const stream = streamRef.current
    if (!stream) return

    for (const track of stream.getAudioTracks()) {
      if (track.readyState === 'live') {
        track.enabled = false
      }
    }
  }, [])

  const resumeMicAfterPlayback = useCallback(async () => {
    const stream = streamRef.current
    if (!stream) return

    for (const track of stream.getAudioTracks()) {
      if (track.readyState === 'live') {
        track.enabled = true
      }
    }
  }, [])

  useEffect(() => {
    const suspendForPageHide = () => {
      scheduleBackgroundSuspend()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        scheduleBackgroundSuspend()
        return
      }
      if (document.visibilityState === 'visible') {
        scheduleForegroundRecovery()
      }
    }

    const bindAppLifecycle = async () => {
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('pagehide', suspendForPageHide)

      if (Capacitor.isNativePlatform()) {
        const { App } = await import('@capacitor/app')
        const appHandle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            scheduleForegroundRecovery()
            return
          }
          scheduleBackgroundSuspend()
        })

        return {
          remove: async () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('pagehide', suspendForPageHide)
            await appHandle.remove()
          },
        }
      }

      return {
        remove: async () => {
          document.removeEventListener('visibilitychange', onVisibilityChange)
          window.removeEventListener('pagehide', suspendForPageHide)
        },
      }
    }

    let removeListener: (() => void) | undefined

    void bindAppLifecycle().then((handle) => {
      removeListener = () => {
        void handle.remove()
      }
    })

    return () => {
      if (foregroundRestartTimerRef.current !== null) {
        window.clearTimeout(foregroundRestartTimerRef.current)
        foregroundRestartTimerRef.current = null
      }
      if (backgroundSuspendTimerRef.current !== null) {
        window.clearTimeout(backgroundSuspendTimerRef.current)
        backgroundSuspendTimerRef.current = null
      }
      foregroundRestartTokenRef.current += 1
      removeListener?.()
    }
  }, [scheduleBackgroundSuspend, scheduleForegroundRecovery, suspendCameraForBackground])

  useEffect(() => {
    if (recordingMode !== 'video') return

    const revivePreview = () => {
      if (isRecordingRef.current || autoPreRollActiveRef.current) return
      if (isInlineTakePlaybackDeferringCameraPreview()) return
      if (resumeInFlightRef.current || !readyRef.current) return
      const stream = streamRef.current
      if (!stream || recordingModeRef.current !== 'video') return

      const videoLive = stream
        .getVideoTracks()
        .some((track) => track.readyState === 'live' && track.enabled)
      if (!videoLive) return

      syncPreviewTargets(stream, 'video')
    }

    revivePreview()
    const intervalId = window.setInterval(revivePreview, 2500)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [recordingMode, streamGeneration, syncPreviewTargets])

  return {
    previewRef,
    streamRef,
    streamGeneration,
    error,
    needsPermission,
    permissionRequestInFlight,
    requestCameraAccess,
    ready,
    isRecording,
    isStopping,
    elapsed,
    recordingMode,
    changeRecordingMode,
    toggleRecording,
    startRecording,
    startAutoAudioRecording,
    startAutoRecording,
    stopRecording,
    ensureRecordableStream,
    warmAutoAudioRecorder,
    disarmAutoAudioRecorder,
    warmAutoRecording,
    disarmAutoRecording,
    tryMarkAutoPerformanceStart,
    isAutoPreRollCaptureActive: () =>
      autoPreRollActiveRef.current && !autoPerformanceActiveRef.current,
    getAutoPreRollAgeMs: () =>
      autoPreRollActiveRef.current
        ? performance.now() - autoPreRollStartedAtRef.current
        : 0,
    restartAutoPreRollCapture,
    refreshCameraSession,
    requestCameraPreviewResume,
    reacquireStreamForAudioRoute,
    retuneCaptureAudio,
    reacquireCaptureStream,
    suspendCameraForBackground,
    suspendMicForPlayback,
    resumeMicAfterPlayback,
    isPreviewRecovering,
    nativeLivePreviewActive,
    nativeLivePreviewSeedUrl,
    acquireNativeVideoBridge,
    setSuppressNativeBridgeRecovery,
  }
}

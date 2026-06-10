import { useCallback, useEffect, useRef, useState } from 'react'
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
import { readRecordingOrientation } from '../utils/takeVideoTransform'
import {
  normalizeBlobMime,
  persistRecordingBlob,
  StreamingTakeWriter,
  type RecordingCompletePayload,
} from '../utils/takeStorage'
import { tuneMusicRecordingStream } from '../utils/audioCapture'
import { tuneVideoRecordingStream } from '../utils/videoCapture'
import {
  applyViewportCssVarsOnResume,
  refreshCameraPreviewLayout,
} from '../utils/viewportSync'

interface UseCameraSessionOptions {
  onRecordingComplete: (payload: RecordingCompletePayload) => void
}

const CAMERA_INIT_MAX_ATTEMPTS = 3
const CAMERA_INIT_RETRY_MS = 450
const CAMERA_RELEASE_DELAY_MS = 700
const FOREGROUND_RESTART_DELAY_MS = 250
const IOS_CAMERA_RELEASE_DELAY_MS = 250
const IOS_AUDIO_TO_VIDEO_DELAY_MS = 200
const IOS_VIDEO_TO_AUDIO_DELAY_MS = 280
const BACKGROUND_SUSPEND_DELAY_MS = 500

function detachPreviewStream(video: HTMLVideoElement | null) {
  if (!video) return
  try {
    video.pause()
    video.srcObject = null
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

function detachRecorder(recorder: MediaRecorder) {
  recorder.ondataavailable = null
  recorder.onstop = null
  recorder.onerror = null
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
  void video.play().catch(() => {})
}

export function useCameraSession({
  onRecordingComplete,
}: UseCameraSessionOptions) {
  const previewRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const writerRef = useRef<StreamingTakeWriter | null>(null)
  const activeTakeIdRef = useRef<string | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recorderMimeTypeRef = useRef<string>('video/webm')
  const recordingModeRef = useRef<RecordingMode>('video')
  const previousRecordingModeRef = useRef<RecordingMode>('video')
  const isRecordingRef = useRef(false)
  const readyRef = useRef(false)
  const resumeInFlightRef = useRef(false)
  const foregroundRestartTokenRef = useRef(0)
  const foregroundRestartTimerRef = useRef<number | null>(null)
  const backgroundSuspendTimerRef = useRef<number | null>(null)
  const releaseTimerRef = useRef<number | null>(null)
  const elapsedRef = useRef(0)
  const onCompleteRef = useRef(onRecordingComplete)
  const armedAutoAudioRef = useRef<{
    recorder: MediaRecorder
    writer: StreamingTakeWriter
    takeId: string
    mimeType: string
  } | null>(null)
  const warmAutoAudioInFlightRef = useRef(false)
  const recordingOrientationRef = useRef<'portrait' | 'landscape'>('portrait')
  const scheduleWarmAutoAudioRef = useRef<() => void>(() => {})
  onCompleteRef.current = onRecordingComplete

  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('video')
  const [streamGeneration, setStreamGeneration] = useState(0)

  recordingModeRef.current = recordingMode
  isRecordingRef.current = isRecording
  readyRef.current = ready

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

  const forceClearCameraState = useCallback(() => {
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

    detachPreviewStream(previewRef.current)
  }, [])

  const releaseLiveStream = useCallback(() => {
    stopStreamTracks(streamRef.current)
    streamRef.current = null
    setReady(false)
    setStreamGeneration((generation) => generation + 1)
    detachPreviewStream(previewRef.current)
  }, [stopStreamTracks])

  const scheduleReleaseCameraState = useCallback(() => {
    cancelScheduledRelease()
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null
      forceClearCameraState()
    }, CAMERA_RELEASE_DELAY_MS)
  }, [cancelScheduledRelease, forceClearCameraState])

  const acquireStream = useCallback(
    async (mode: RecordingMode, cancelled?: () => boolean) => {
      setError(null)

      stopStreamTracks(streamRef.current)
      streamRef.current = null
      detachPreviewStream(previewRef.current)

      const constraints: MediaStreamConstraints =
        mode === 'audio'
          ? { audio: getAudioCaptureConstraints(), video: false }
          : {
              audio: getAudioCaptureConstraints(),
              video: getVideoCaptureConstraints(),
            }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      if (cancelled?.()) {
        mediaStream.getTracks().forEach((track) => track.stop())
        return null
      }
      await tuneMusicRecordingStream(mediaStream)
      streamRef.current = mediaStream
      attachPreviewStream(previewRef.current, mediaStream, mode)
      setStreamGeneration((generation) => generation + 1)
      setReady(true)
      return mediaStream
    },
    [stopStreamTracks],
  )

  const ensureRecordableStream = useCallback(async (): Promise<MediaStream | null> => {
    const mode = recordingModeRef.current
    const stream = streamRef.current

    if (readyRef.current && isStreamRecordable(stream, mode)) {
      return stream
    }

    try {
      return await acquireStream(mode)
    } catch {
      return null
    }
  }, [acquireStream])

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | null = null
    let activeStream: MediaStream | null = null

    const startWithRecovery = async (attempt = 0) => {
      cancelScheduledRelease()
      if (streamRef.current) {
        forceClearCameraState()
      }

      const mode = recordingMode
      const leavingAudioForVideo =
        previousRecordingModeRef.current === 'audio' && mode === 'video'
      const enteringAudioFromVideo =
        previousRecordingModeRef.current === 'video' && mode === 'audio'

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

        if (attempt + 1 < CAMERA_INIT_MAX_ATTEMPTS) {
          retryTimer = window.setTimeout(() => {
            void startWithRecovery(attempt + 1).catch(() => {
              /* retried inside startWithRecovery */
            })
          }, CAMERA_INIT_RETRY_MS)
          return
        }

        setError(
          err instanceof Error
            ? err.message
            : recordingMode === 'audio'
              ? 'Unable to access microphone.'
              : 'Unable to access camera and microphone.',
        )
        setReady(false)
      }
    }

    void startWithRecovery().catch(() => {
      /* startWithRecovery handles its own errors */
    })

    return () => {
      cancelled = true
      cancelScheduledRelease()
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
      void abortActiveWriter().catch(() => {})

      stopStreamTracks(activeStream)
      if (streamRef.current === activeStream) {
        streamRef.current = null
      }
      attachPreviewStream(previewRef.current, null, recordingMode)
      setReady(false)
    }
  }, [
    abortActiveWriter,
    acquireStream,
    cancelScheduledRelease,
    forceClearCameraState,
    recordingMode,
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
          const durationSeconds = elapsedRef.current

          try {
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
              })
            } else {
              const writeMime = normalizeBlobMime(recorderMimeTypeRef.current)
              const blob = new Blob(capturedChunks, { type: writeMime })
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
              })
            }
          } catch {
            if (activeWriter) {
              await activeWriter.abort().catch(() => {})
            }
          } finally {
            setIsRecording(false)
            scheduleWarmAutoAudioRef.current()
          }
        })().catch(() => {
          setIsRecording(false)
        })
      }

      recorder.onerror = () => {
        chunksRef.current = []
        void abortActiveWriter().catch(() => {})
        if (recorderRef.current) {
          detachRecorder(recorderRef.current)
        }
        recorderRef.current = null
        setIsRecording(false)
      }
    },
    [abortActiveWriter],
  )

  const disarmAutoAudioRecorder = useCallback(async () => {
    const armed = armedAutoAudioRef.current
    armedAutoAudioRef.current = null
    if (!armed) return

    detachRecorder(armed.recorder)
    try {
      await armed.writer.abort()
    } catch {
      /* ignore */
    }
  }, [])

  const warmAutoAudioRecorder = useCallback(async () => {
    if (
      recordingModeRef.current !== 'audio' ||
      isRecordingRef.current ||
      armedAutoAudioRef.current ||
      warmAutoAudioInFlightRef.current
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
        armedAutoAudioRef.current
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
        armedAutoAudioRef.current
      ) {
        await writer.abort().catch(() => {})
        return
      }

      const recorder = createMediaRecorder(stream, mimeType)
      bindRecordingHandlers(recorder, takeId)

      armedAutoAudioRef.current = { recorder, writer, takeId, mimeType }
    } catch {
      /* cold start on trigger if warm fails */
    } finally {
      warmAutoAudioInFlightRef.current = false
    }
  }, [bindRecordingHandlers, ensureRecordableStream])

  scheduleWarmAutoAudioRef.current = () => {
    if (recordingModeRef.current !== 'audio') return
    window.setTimeout(() => {
      void warmAutoAudioRecorder()
    }, 200)
  }

  const startRecording = useCallback(() => {
    if (isRecording) return

    void (async () => {
      const currentStream = await ensureRecordableStream()
      if (!currentStream || isRecordingRef.current) return

      await tuneMusicRecordingStream(currentStream)

      const takeId = crypto.randomUUID()
      const mode = recordingModeRef.current
      recordingOrientationRef.current = readRecordingOrientation()
      const mimeType = getRecorderMimeTypeForMode(mode)
      recorderMimeTypeRef.current = mimeType
      chunksRef.current = []

      if (mode === 'video' && recordingOrientationRef.current === 'landscape') {
        await tuneVideoRecordingStream(currentStream, 'landscape')
      }

      let writer: StreamingTakeWriter | null = null
      try {
        writer = await StreamingTakeWriter.open(takeId, mimeType)
        writerRef.current = writer
        activeTakeIdRef.current = takeId

        const recorder = createMediaRecorder(currentStream, mimeType)
        recorderRef.current = recorder
        bindRecordingHandlers(recorder, takeId)

        if (shouldUseRecordingTimeslice(mimeType)) {
          recorder.start(RECORDING_TIMESLICE_MS)
        } else {
          recorder.start()
        }
        setIsRecording(true)
        setElapsed(0)
        elapsedRef.current = 0
      } catch {
        chunksRef.current = []
        await writer?.abort().catch(() => {})
        writerRef.current = null
        activeTakeIdRef.current = null
        recorderRef.current = null
        setIsRecording(false)
      }
    })().catch(() => {
      chunksRef.current = []
      setIsRecording(false)
    })
  }, [bindRecordingHandlers, ensureRecordableStream, isRecording])

  const startAutoAudioRecording = useCallback(() => {
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
  }, [disarmAutoAudioRecorder, startRecording, warmAutoAudioRecorder])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false)
      return
    }

    try {
      if (recorder.state === 'recording') {
        recorder.requestData()
      }
    } catch {
      /* requestData may throw if already stopping */
    }

    recorder.stop()
  }, [])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  const changeRecordingMode = useCallback(
    (mode: RecordingMode) => {
      if (isRecording || mode === recordingModeRef.current) return

      cancelScheduledRelease()
      stopStreamTracks(streamRef.current)
      streamRef.current = null
      detachPreviewStream(previewRef.current)
      void disarmAutoAudioRecorder()
      setReady(false)
      setStreamGeneration((generation) => generation + 1)
      setError(null)
      setRecordingMode(mode)
    },
    [cancelScheduledRelease, disarmAutoAudioRecorder, isRecording, stopStreamTracks],
  )

  const suspendCameraForBackground = useCallback(() => {
    if (isRecordingRef.current) return
    cancelScheduledRelease()
    releaseLiveStream()
  }, [cancelScheduledRelease, releaseLiveStream])

  const restartCameraAfterForeground = useCallback(async () => {
    if (isRecordingRef.current || resumeInFlightRef.current) return

    const restartToken = ++foregroundRestartTokenRef.current
    resumeInFlightRef.current = true
    cancelScheduledRelease()

    try {
      applyViewportCssVarsOnResume()
      releaseLiveStream()

      if (Capacitor.isNativePlatform()) {
        await new Promise((resolve) => window.setTimeout(resolve, IOS_CAMERA_RELEASE_DELAY_MS))
      }
      if (restartToken !== foregroundRestartTokenRef.current) return

      await acquireStream(recordingModeRef.current)
      if (restartToken !== foregroundRestartTokenRef.current) return

      refreshCameraPreviewLayout(previewRef.current)
    } catch {
      setError('Camera interrupted. Close and reopen the app if the preview looks wrong.')
    } finally {
      if (restartToken === foregroundRestartTokenRef.current) {
        resumeInFlightRef.current = false
      }
    }
  }, [acquireStream, cancelScheduledRelease, releaseLiveStream])

  const scheduleForegroundRecovery = useCallback(() => {
    if (backgroundSuspendTimerRef.current !== null) {
      window.clearTimeout(backgroundSuspendTimerRef.current)
      backgroundSuspendTimerRef.current = null
    }

    if (foregroundRestartTimerRef.current !== null) {
      window.clearTimeout(foregroundRestartTimerRef.current)
    }

    foregroundRestartTimerRef.current = window.setTimeout(() => {
      foregroundRestartTimerRef.current = null
      void restartCameraAfterForeground()
    }, FOREGROUND_RESTART_DELAY_MS)
  }, [restartCameraAfterForeground])

  const scheduleBackgroundSuspend = useCallback(() => {
    if (backgroundSuspendTimerRef.current !== null) {
      window.clearTimeout(backgroundSuspendTimerRef.current)
    }

    backgroundSuspendTimerRef.current = window.setTimeout(() => {
      backgroundSuspendTimerRef.current = null
      suspendCameraForBackground()
    }, BACKGROUND_SUSPEND_DELAY_MS)
  }, [suspendCameraForBackground])

  const refreshCameraSession = useCallback(async () => {
    if (isRecordingRef.current || resumeInFlightRef.current) return

    cancelScheduledRelease()
    applyViewportCssVarsOnResume()

    const mode = recordingModeRef.current
    const stream = streamRef.current

    if (!isStreamRecordable(stream, mode)) {
      await restartCameraAfterForeground()
      return
    }

    attachPreviewStream(previewRef.current, stream, mode)
    refreshCameraPreviewLayout(previewRef.current)
    setStreamGeneration((generation) => generation + 1)
  }, [cancelScheduledRelease, restartCameraAfterForeground])

  useEffect(() => {
    const bindAppLifecycle = async () => {
      if (Capacitor.isNativePlatform()) {
        const { App } = await import('@capacitor/app')
        return App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            scheduleForegroundRecovery()
            return
          }
          scheduleBackgroundSuspend()
        })
      }

      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          scheduleForegroundRecovery()
          return
        }
        scheduleBackgroundSuspend()
      }

      document.addEventListener('visibilitychange', onVisibilityChange)
      return {
        remove: async () => {
          document.removeEventListener('visibilitychange', onVisibilityChange)
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

  return {
    previewRef,
    streamRef,
    streamGeneration,
    error,
    ready,
    isRecording,
    elapsed,
    recordingMode,
    changeRecordingMode,
    toggleRecording,
    startRecording,
    startAutoAudioRecording,
    stopRecording,
    warmAutoAudioRecorder,
    disarmAutoAudioRecorder,
    refreshCameraSession,
  }
}

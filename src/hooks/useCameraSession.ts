import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecordingMode } from '../types'
import {
  getRecorderMimeTypeForMode,
  RECORDING_TIMESLICE_MS,
  shouldUseRecordingTimeslice,
} from '../utils/mobileVideo'
import {
  normalizeBlobMime,
  persistRecordingBlob,
  StreamingTakeWriter,
  type RecordingCompletePayload,
} from '../utils/takeStorage'

interface UseCameraSessionOptions {
  onRecordingComplete: (payload: RecordingCompletePayload) => void
}

const CAMERA_INIT_MAX_ATTEMPTS = 3
const CAMERA_INIT_RETRY_MS = 450
const CAMERA_RELEASE_DELAY_MS = 700

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
  const releaseTimerRef = useRef<number | null>(null)
  const onCompleteRef = useRef(onRecordingComplete)
  onCompleteRef.current = onRecordingComplete

  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('video')
  const [streamGeneration, setStreamGeneration] = useState(0)

  recordingModeRef.current = recordingMode

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

    const video = previewRef.current
    if (video) {
      try {
        video.pause()
        video.srcObject = null
      } catch {
        /* ignore */
      }
    }
  }, [])

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
      const constraints: MediaStreamConstraints =
        mode === 'audio'
          ? { audio: true, video: false }
          : { audio: true, video: true }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      if (cancelled?.()) {
        mediaStream.getTracks().forEach((track) => track.stop())
        return null
      }
      streamRef.current = mediaStream
      attachPreviewStream(previewRef.current, mediaStream, mode)
      setStreamGeneration((generation) => generation + 1)
      setReady(true)
      return mediaStream
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | null = null
    let activeStream: MediaStream | null = null

    const startWithRecovery = async (attempt = 0) => {
      cancelScheduledRelease()
      forceClearCameraState()

      try {
        const mediaStream = await acquireStream(recordingMode, () => cancelled)
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
      setElapsed((prev) => prev + 1)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isRecording])

  const startRecording = useCallback(() => {
    const currentStream = streamRef.current
    if (!currentStream || isRecording) return

    void (async () => {
      const takeId = crypto.randomUUID()
      const mode = recordingModeRef.current
      const mimeType = getRecorderMimeTypeForMode(mode)
      recorderMimeTypeRef.current = mimeType
      chunksRef.current = []

      let writer: StreamingTakeWriter | null = null
      try {
        writer = await StreamingTakeWriter.open(takeId, mimeType)
        writerRef.current = writer
        activeTakeIdRef.current = takeId

        const recorder = new MediaRecorder(currentStream, { mimeType })
        recorderRef.current = recorder

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

            try {
              if (activeWriter) {
                const persisted = await activeWriter.finalize()
                onCompleteRef.current({
                  takeId: stoppedTakeId,
                  mimeType: recorderMimeTypeRef.current,
                  mediaType: completedMode,
                  filePath: persisted.filePath,
                  videoUrl: persisted.videoUrl,
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
                  blob,
                })
              }
            } catch {
              if (activeWriter) {
                await activeWriter.abort().catch(() => {})
              }
            } finally {
              setIsRecording(false)
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

        if (shouldUseRecordingTimeslice(mimeType)) {
          recorder.start(RECORDING_TIMESLICE_MS)
        } else {
          recorder.start()
        }
        setIsRecording(true)
        setElapsed(0)
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
  }, [abortActiveWriter, isRecording])

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
      if (isRecording) return
      setRecordingMode(mode)
    },
    [isRecording],
  )

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
  }
}

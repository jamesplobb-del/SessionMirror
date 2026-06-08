import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  getRecorderMimeType,
  RECORDING_TIMESLICE_MS,
} from '../utils/mobileVideo'
import {
  NATIVE_VIDEO_MIME,
  persistRecordingBlob,
  StreamingTakeWriter,
  type RecordingCompletePayload,
} from '../utils/takeStorage'

interface UseCameraSessionOptions {
  onRecordingComplete: (payload: RecordingCompletePayload) => void
  enabled?: boolean
  /** Bump when returning to the camera screen to force a fresh stream. */
  initKey?: number
}

const CAMERA_INIT_MAX_ATTEMPTS = 3
const CAMERA_INIT_RETRY_MS = 450

function detachRecorder(recorder: MediaRecorder) {
  recorder.ondataavailable = null
  recorder.onstop = null
  recorder.onerror = null
}

export function useCameraSession({
  onRecordingComplete,
  enabled = true,
  initKey = 0,
}: UseCameraSessionOptions) {
  const previewRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const writerRef = useRef<StreamingTakeWriter | null>(null)
  const activeTakeIdRef = useRef<string | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recorderMimeTypeRef = useRef<string>('video/webm')
  const onCompleteRef = useRef(onRecordingComplete)
  onCompleteRef.current = onRecordingComplete

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)

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
    setStream(null)
    setReady(false)

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

  const acquireStream = useCallback(async (cancelled?: () => boolean) => {
    setError(null)
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    })
    if (cancelled?.()) {
      mediaStream.getTracks().forEach((track) => track.stop())
      return null
    }
    streamRef.current = mediaStream
    setStream(mediaStream)
    setReady(true)
    return mediaStream
  }, [])

  const restartCameraAfterRecording = useCallback(async () => {
    forceClearCameraState()
    try {
      await acquireStream()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to restart camera after recording.',
      )
      setReady(false)
    }
  }, [acquireStream, forceClearCameraState])

  useEffect(() => {
    if (!enabled) {
      void abortActiveWriter().catch(() => {})
      forceClearCameraState()
      return
    }

    let cancelled = false
    let retryTimer: number | null = null

    const startWithRecovery = async (attempt = 0) => {
      forceClearCameraState()

      try {
        await acquireStream(() => cancelled)
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
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
      void abortActiveWriter().catch(() => {})
      forceClearCameraState()
    }
  }, [
    enabled,
    initKey,
    abortActiveWriter,
    acquireStream,
    forceClearCameraState,
  ])

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
      const mimeType = getRecorderMimeType()
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
            chunksRef.current = []

            const activeWriter = writerRef.current
            writerRef.current = null
            const stoppedTakeId = activeTakeIdRef.current ?? takeId
            activeTakeIdRef.current = null

            try {
              if (activeWriter) {
                const persisted = await activeWriter.finalize()
                onCompleteRef.current({
                  takeId: stoppedTakeId,
                  mimeType: recorderMimeTypeRef.current,
                  filePath: persisted.filePath,
                  videoUrl: persisted.videoUrl,
                })
              } else {
                const parts = chunksRef.current
                chunksRef.current = []
                const writeMime = recorderMimeTypeRef.current.includes('mp4')
                  ? NATIVE_VIDEO_MIME
                  : recorderMimeTypeRef.current
                const blob = new Blob(parts, { type: writeMime })
                const persisted = await persistRecordingBlob(
                  blob,
                  stoppedTakeId,
                  recorderMimeTypeRef.current,
                )
                onCompleteRef.current({
                  takeId: stoppedTakeId,
                  mimeType: recorderMimeTypeRef.current,
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
              if (Capacitor.isNativePlatform() && enabled) {
                try {
                  await restartCameraAfterRecording()
                } catch {
                  forceClearCameraState()
                }
              }
            }
          })().catch(() => {
            setIsRecording(false)
            forceClearCameraState()
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

        recorder.start(RECORDING_TIMESLICE_MS)
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
  }, [
    abortActiveWriter,
    enabled,
    forceClearCameraState,
    isRecording,
    restartCameraAfterRecording,
  ])

  const stopRecording = useCallback(() => {
    setIsRecording(false)
    chunksRef.current = []

    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
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

  return {
    previewRef,
    stream,
    error,
    ready,
    isRecording,
    elapsed,
    toggleRecording,
  }
}

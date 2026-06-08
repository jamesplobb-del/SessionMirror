import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getRecorderMimeType,
  RECORDING_TIMESLICE_MS,
} from '../utils/mobileVideo'
import {
  persistRecordingBlob,
  StreamingTakeWriter,
  type RecordingCompletePayload,
} from '../utils/takeStorage'

interface UseCameraSessionOptions {
  onRecordingComplete: (payload: RecordingCompletePayload) => void
}

export function useCameraSession({ onRecordingComplete }: UseCameraSessionOptions) {
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
      await writer.abort()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      setError(null)
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = mediaStream
        setStream(mediaStream)
        setReady(true)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to access camera and microphone.',
        )
        setReady(false)
      }
    }

    void start()

    return () => {
      cancelled = true
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setStream(null)
      recorderRef.current = null
      chunksRef.current = []
      void abortActiveWriter()

      const video = previewRef.current
      if (video) {
        video.pause()
        video.srcObject = null
      }
    }
  }, [abortActiveWriter])

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
              await abortActiveWriter()
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
                const blob = new Blob(parts, {
                  type: recorderMimeTypeRef.current,
                })
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
                await activeWriter.abort()
              }
            } finally {
              recorderRef.current = null
              setIsRecording(false)
            }
          })()
        }

        recorder.onerror = () => {
          void abortActiveWriter()
          setIsRecording(false)
        }

        recorder.start(RECORDING_TIMESLICE_MS)
        setIsRecording(true)
        setElapsed(0)
      } catch {
        chunksRef.current = []
        await writer?.abort()
        writerRef.current = null
        activeTakeIdRef.current = null
        recorderRef.current = null
        setIsRecording(false)
      }
    })()
  }, [abortActiveWriter, isRecording])

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    } else {
      setIsRecording(false)
    }
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

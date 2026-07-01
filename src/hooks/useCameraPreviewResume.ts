import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { RecordingMode } from '../types'
import { resetCameraPreviewZoom } from '../utils/videoCapture'

const SLOW_RESUME_MS = 400
const FRAME_CACHE_INTERVAL_MS = 700
const PLACEHOLDER_FADE_MS = 320

interface UseCameraPreviewResumeOptions {
  previewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  recordingMode: RecordingMode
  resumeNonce?: number
}

function isStreamVideoLive(stream: MediaStream | null): boolean {
  return Boolean(
    stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled),
  )
}

function isVideoPreviewLive(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
): boolean {
  if (!video || !isStreamVideoLive(stream)) return false
  return !video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
}

export function useCameraPreviewResume({
  previewRef,
  streamRef,
  streamGeneration,
  recordingMode,
  resumeNonce = 0,
}: UseCameraPreviewResumeOptions) {
  const [placeholderUrl, setPlaceholderUrl] = useState<string | null>(null)
  const [placeholderVisible, setPlaceholderVisible] = useState(false)
  const [placeholderFading, setPlaceholderFading] = useState(false)
  const [showSlowIndicator, setShowSlowIndicator] = useState(false)

  const lastFrameRef = useRef<string | null>(null)
  const hadLivePreviewRef = useRef(false)
  const resumeActiveRef = useRef(false)
  const fadeTimerRef = useRef<number | null>(null)
  const placeholderFadingRef = useRef(false)
  const lastResumeNonceRef = useRef(resumeNonce)

  const captureFrame = useCallback((): string | null => {
    const video = previewRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return null

    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/jpeg', 0.8)
      lastFrameRef.current = url
      return url
    } catch {
      return lastFrameRef.current
    }
  }, [previewRef])

  const clearFadeTimer = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current)
      fadeTimerRef.current = null
    }
  }, [])

  const finishResume = useCallback(() => {
    clearFadeTimer()
    resumeActiveRef.current = false
    placeholderFadingRef.current = false
    setPlaceholderVisible(false)
    setPlaceholderFading(false)
    setPlaceholderUrl(null)
    setShowSlowIndicator(false)
  }, [clearFadeTimer])

  const beginResume = useCallback(() => {
    if (recordingMode !== 'video') return
    if (resumeActiveRef.current) return

    const frame = captureFrame() ?? lastFrameRef.current
    if (!frame || !hadLivePreviewRef.current) return

    resumeActiveRef.current = true
    console.log('[CameraPreview] resume requested')
    setPlaceholderUrl(frame)
    setPlaceholderVisible(true)
    setPlaceholderFading(false)
    setShowSlowIndicator(false)
    console.log('[CameraPreview] showing placeholder')
  }, [captureFrame, recordingMode])

  const tryRestoreLive = useCallback(() => {
    if (!resumeActiveRef.current || placeholderFadingRef.current) return

    const video = previewRef.current
    const stream = streamRef.current
    if (!isVideoPreviewLive(video, stream)) return

    console.log('[CameraPreview] live preview restored')
    placeholderFadingRef.current = true
    setPlaceholderFading(true)
    clearFadeTimer()
    fadeTimerRef.current = window.setTimeout(() => {
      fadeTimerRef.current = null
      finishResume()
    }, PLACEHOLDER_FADE_MS)
  }, [clearFadeTimer, finishResume, previewRef, streamRef])

  useEffect(() => {
    if (recordingMode === 'audio') {
      lastFrameRef.current = null
      finishResume()
      return
    }

    const video = previewRef.current
    const stream = streamRef.current
    if (isVideoPreviewLive(video, stream)) {
      hadLivePreviewRef.current = true
      if (resumeActiveRef.current) {
        tryRestoreLive()
      }
    }
  }, [
    finishResume,
    previewRef,
    recordingMode,
    streamGeneration,
    streamRef,
    tryRestoreLive,
  ])

  useEffect(() => {
    if (recordingMode !== 'video') return
    if (resumeNonce === 0 || resumeNonce === lastResumeNonceRef.current) return
    lastResumeNonceRef.current = resumeNonce
    beginResume()
  }, [beginResume, recordingMode, resumeNonce])

  useEffect(() => {
    if (recordingMode !== 'video') return

    const intervalId = window.setInterval(() => {
      if (isVideoPreviewLive(previewRef.current, streamRef.current)) {
        captureFrame()
      }
    }, FRAME_CACHE_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [captureFrame, previewRef, recordingMode, streamGeneration, streamRef])

  useEffect(() => {
    if (!placeholderVisible) return

    const video = previewRef.current
    if (!video) return

    const onLive = () => tryRestoreLive()
    video.addEventListener('playing', onLive)
    video.addEventListener('loadeddata', onLive)
    video.addEventListener('canplay', onLive)

    const pollId = window.setInterval(tryRestoreLive, 150)

    return () => {
      video.removeEventListener('playing', onLive)
      video.removeEventListener('loadeddata', onLive)
      video.removeEventListener('canplay', onLive)
      window.clearInterval(pollId)
    }
  }, [placeholderVisible, previewRef, tryRestoreLive])

  useEffect(() => {
    if (!placeholderVisible) {
      setShowSlowIndicator(false)
      return
    }

    const timerId = window.setTimeout(() => {
      setShowSlowIndicator(true)
    }, SLOW_RESUME_MS)

    return () => window.clearTimeout(timerId)
  }, [placeholderVisible])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        resetCameraPreviewZoom()
        captureFrame()
        return
      }
      if (document.visibilityState === 'visible' && recordingMode === 'video') {
        beginResume()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [beginResume, captureFrame, recordingMode])

  useEffect(() => () => clearFadeTimer(), [clearFadeTimer])

  return {
    resumingPreview: placeholderVisible,
    placeholderUrl,
    placeholderFading,
    showSlowIndicator,
  }
}

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { Camera } from 'lucide-react'
import TakeVideoPlayer from '../../components/TakeVideoPlayer'
import type { Take } from '../../types'
import {
  createNativePreviewFramePump,
  subscribeNativeCameraPreviewFrames,
} from '../../utils/nativeCameraFrameBridge'
import { setNativeCameraFrameBridgeEnabled } from '../../utils/nativeCameraTest'
import type { MultitrackRecordingPhase } from '../types'

interface MultitrackCapturePanelProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  nativeLivePreviewActive: boolean
  nativeCameraBridgeEnabled: boolean
  phase: MultitrackRecordingPhase
  countInRemaining: number
  elapsed: number
  reviewTake: Take | null
  reviewMediaRef: RefObject<HTMLMediaElement | null>
}

function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Live camera/review surface that stays inside the selected layout tile. */
export default function MultitrackCapturePanel({
  streamRef,
  streamGeneration,
  nativeLivePreviewActive,
  nativeCameraBridgeEnabled,
  phase,
  countInRemaining,
  elapsed,
  reviewTake,
  reviewMediaRef,
}: MultitrackCapturePanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const framePumpRef = useRef<ReturnType<typeof createNativePreviewFramePump> | null>(null)
  const bridgePrimedRef = useRef(false)
  const showNativeCanvas = nativeCameraBridgeEnabled || nativeLivePreviewActive

  useEffect(() => {
    if (reviewTake || nativeLivePreviewActive) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    void video.play().catch(() => {})
    return () => {
      video.srcObject = null
    }
  }, [nativeLivePreviewActive, reviewTake, streamGeneration, streamRef])

  useEffect(() => {
    if (reviewTake || !nativeCameraBridgeEnabled) return

    let cancelled = false
    let removeListener: (() => void) | null = null
    if (!framePumpRef.current) {
      framePumpRef.current = createNativePreviewFramePump(canvasRef)
    }
    const pump = framePumpRef.current
    void setNativeCameraFrameBridgeEnabled(true)
    void (async () => {
      const subscription = await subscribeNativeCameraPreviewFrames((event) => {
        if (cancelled || !bridgePrimedRef.current) return
        pump.push(event)
      })
      if (!subscription) return
      if (cancelled) {
        void subscription.remove()
        return
      }
      removeListener = () => void subscription.remove()
    })()

    return () => {
      cancelled = true
      removeListener?.()
      void setNativeCameraFrameBridgeEnabled(false)
      bridgePrimedRef.current = false
      pump.stop()
      framePumpRef.current = null
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [nativeCameraBridgeEnabled, reviewTake])

  useEffect(() => {
    bridgePrimedRef.current = nativeLivePreviewActive
  }, [nativeLivePreviewActive])

  if (reviewTake) {
    return (
      <div className="multitrack-panel multitrack-panel--capture multitrack-panel--reviewing">
        <TakeVideoPlayer
          filePath={reviewTake.filePath}
          videoUrl={reviewTake.videoUrl}
          mimeType={reviewTake.videoMimeType}
          videoRef={reviewMediaRef}
          videoSourceKey={reviewTake.id}
          className="multitrack-panel__media"
          loadingClassName="multitrack-panel__media multitrack-panel__media--loading"
          mirror={reviewTake.mirrorPlayback === true}
          recordingOrientation={reviewTake.recordingOrientation}
          fit="cover"
          eagerLoad
          preload="auto"
          manualPlayOnly
          audible
          poster={reviewTake.thumbnailUrl || undefined}
        />
        <span className="multitrack-capture-panel__status">Review</span>
      </div>
    )
  }

  const waitingForCamera = !streamRef.current && !nativeLivePreviewActive
  return (
    <div className="multitrack-panel multitrack-panel--capture">
      {showNativeCanvas ? (
        <canvas
          ref={canvasRef}
          className={`multitrack-capture-panel__preview ${
            nativeLivePreviewActive ? '' : 'multitrack-capture-panel__preview--hidden'
          }`}
          aria-hidden
        />
      ) : null}
      <video
        ref={videoRef}
        className={`multitrack-capture-panel__preview ${
          nativeLivePreviewActive ? 'multitrack-capture-panel__preview--hidden' : ''
        }`}
        muted
        playsInline
      />
      <div className="multitrack-capture-panel__shade" aria-hidden />
      {phase === 'arming' ? (
        <span className="multitrack-capture-panel__count">…</span>
      ) : phase === 'count-in' && countInRemaining > 0 ? (
        <span className="multitrack-capture-panel__count">{countInRemaining}</span>
      ) : phase === 'recording' ? (
        <span className="multitrack-capture-panel__status multitrack-capture-panel__status--recording">
          <i aria-hidden /> {formatElapsed(elapsed)}
        </span>
      ) : null}
      {waitingForCamera ? (
        <span className="multitrack-capture-panel__camera-wait">
          <Camera className="h-4 w-4" /> Waking camera
        </span>
      ) : null}
    </div>
  )
}

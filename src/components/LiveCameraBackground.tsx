import { memo, useEffect, type RefObject, type VideoHTMLAttributes } from 'react'
import { Mic } from 'lucide-react'
import type { RecordingMode } from '../types'
import { refreshCameraPreviewLayout } from '../utils/viewportSync'
import { mobileVideoProps } from '../utils/mobileVideo'

interface LiveCameraBackgroundProps {
  previewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  error: string | null
  recordingMode: RecordingMode
  isRecording: boolean
  viewportKey?: number
}

function LiveCameraBackground({
  previewRef,
  streamRef,
  streamGeneration,
  error,
  recordingMode,
  isRecording,
  viewportKey,
}: LiveCameraBackgroundProps) {
  const isAudioMode = recordingMode === 'audio'

  useEffect(() => {
    const video = previewRef.current
    if (!video) return

    refreshCameraPreviewLayout(video)

    if (recordingMode === 'audio') {
      if (video.srcObject) {
        video.srcObject = null
      }
      return
    }

    const stream = streamRef.current
    if (!stream) return

    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    video.muted = true
    void video.play().catch(() => {})

    const timers = [100, 300].map((delay) =>
      window.setTimeout(() => refreshCameraPreviewLayout(video), delay),
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [previewRef, streamRef, recordingMode, streamGeneration, viewportKey])

  return (
    <div className="camera-background" aria-hidden>
      <video
        ref={previewRef}
        autoPlay
        muted
        playsInline
        disablePictureInPicture
        {...mobileVideoProps}
        {...({
          'webkit-playsinline': 'true',
        } as VideoHTMLAttributes<HTMLVideoElement>)}
        className={`camera-preview ${
          isAudioMode ? 'camera-preview--hidden' : 'camera-preview--mirror'
        }`}
      />

      {isAudioMode && (
        <div className="camera-background-overlay flex flex-col items-center justify-center bg-gradient-to-b from-stone-950 via-stone-900 to-black">
          <div
            className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/5 ${
              isRecording ? 'shadow-[0_0_24px_rgba(56,189,248,0.35)]' : ''
            }`}
          >
            <Mic
              className={`h-7 w-7 text-sky-300 ${isRecording ? 'animate-pulse' : 'opacity-80'}`}
            />
          </div>
          <div className="flex h-8 items-end justify-center gap-1">
            {[0, 1, 2, 3, 4].map((bar) => (
              <div
                key={bar}
                className={`w-1 rounded-full bg-sky-400/70 ${
                  isRecording ? 'animate-pulse' : 'opacity-30'
                }`}
                style={{
                  height: `${12 + bar * 4}px`,
                  animationDelay: `${bar * 90}ms`,
                }}
              />
            ))}
          </div>
          <p className="mt-4 text-xs font-medium tracking-wide text-white/45 uppercase">
            Audio Mode
          </p>
        </div>
      )}

      {error && (
        <div className="camera-background-overlay flex items-center justify-center bg-stone-900">
          <p className="max-w-sm px-6 text-center text-sm text-white/70">{error}</p>
        </div>
      )}

      <div
        className={`camera-background-overlay pointer-events-none bg-gradient-to-b from-black/25 via-transparent to-black/45 ${
          isAudioMode ? 'opacity-40' : 'opacity-100'
        }`}
      />
    </div>
  )
}

export default memo(
  LiveCameraBackground,
  (prev, next) =>
    prev.previewRef === next.previewRef &&
    prev.streamRef === next.streamRef &&
    prev.streamGeneration === next.streamGeneration &&
    prev.error === next.error &&
    prev.recordingMode === next.recordingMode &&
    prev.isRecording === next.isRecording &&
    prev.viewportKey === next.viewportKey,
)

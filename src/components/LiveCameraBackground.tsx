import { memo, useEffect, useState, type RefObject, type VideoHTMLAttributes } from 'react'
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
  previewLive?: boolean
  viewportKey?: number
  /** Hide the idle audio-mode mic UI while main-screen pitch analysis is showing. */
  pitchStageActive?: boolean
}

function LiveCameraBackground({
  previewRef,
  streamRef,
  streamGeneration,
  error,
  recordingMode,
  isRecording,
  previewLive = false,
  viewportKey,
  pitchStageActive = false,
}: LiveCameraBackgroundProps) {
  const isAudioMode = recordingMode === 'audio'
  const showAudioIdle = isAudioMode && !pitchStageActive
  const [previewVisible, setPreviewVisible] = useState(false)

  useEffect(() => {
    if (!previewLive || isAudioMode) {
      setPreviewVisible(false)
      return
    }

    const video = previewRef.current
    if (!video) return

    const reveal = () => setPreviewVisible(true)
    if (video.readyState >= 2) {
      reveal()
      return
    }

    video.addEventListener('loadeddata', reveal, { once: true })
    return () => {
      video.removeEventListener('loadeddata', reveal)
    }
  }, [previewLive, isAudioMode, previewRef, streamGeneration])

  useEffect(() => {
    const video = previewRef.current
    if (!video || isAudioMode) {
      if (video?.srcObject) {
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
  }, [previewRef, streamRef, recordingMode, streamGeneration, isAudioMode])

  useEffect(() => {
    const video = previewRef.current
    if (!video || isAudioMode) return
    refreshCameraPreviewLayout(video)
  }, [previewRef, viewportKey, isAudioMode])

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
          isAudioMode
            ? 'camera-preview--hidden'
            : previewVisible
              ? 'camera-preview--mirror camera-preview--live'
              : 'camera-preview--mirror camera-preview--booting'
        }`}
      />

      {isAudioMode && pitchStageActive && (
        <div className="pitch-stage-ambient pitch-stage-ambient--live-tuner" aria-hidden />
      )}

      {showAudioIdle && (
        <div className="camera-background-overlay pitch-audio-idle flex flex-col items-center justify-center">
          <div
            className={`pitch-audio-idle__orb mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full ${
              isRecording ? 'pitch-audio-idle__orb--recording' : ''
            }`}
          >
            <Mic className={`h-7 w-7 ${isRecording ? 'text-sky-200' : 'text-sky-300/90'}`} />
          </div>
          <div className="flex h-9 items-end justify-center gap-1.5">
            {[0, 1, 2, 3, 4].map((bar) => (
              <div
                key={bar}
                className={`pitch-audio-idle__bar w-[3px] rounded-full ${
                  isRecording ? 'pitch-audio-idle__bar--live' : ''
                }`}
                style={{
                  height: `${14 + bar * 5}px`,
                  animationDelay: `${bar * 90}ms`,
                }}
              />
            ))}
          </div>
          <p className="pitch-audio-idle__label mt-5 text-sm font-medium">
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
          showAudioIdle ? 'opacity-40' : isAudioMode ? 'opacity-0' : 'opacity-100'
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
    prev.previewLive === next.previewLive &&
    prev.viewportKey === next.viewportKey &&
    prev.pitchStageActive === next.pitchStageActive,
)

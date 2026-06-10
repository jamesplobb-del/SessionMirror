import { memo, useEffect, type RefObject, type VideoHTMLAttributes } from 'react'
import { Mic } from 'lucide-react'
import type { RecordingMode } from '../types'
import { mobileVideoProps } from '../utils/mobileVideo'
import { agentDebugLog } from '../utils/agentDebugLog'

interface LiveCameraBackgroundProps {
  previewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  error: string | null
  recordingMode: RecordingMode
  isRecording: boolean
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
  pitchStageActive = false,
}: LiveCameraBackgroundProps) {
  const isAudioMode = recordingMode === 'audio'
  const showAudioIdle = isAudioMode && !pitchStageActive

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
      void video.play().catch(() => {})
    } else if (video.paused) {
      void video.play().catch(() => {})
    }
  }, [previewRef, streamRef, streamGeneration, recordingMode, isAudioMode])

  useEffect(() => {
    const onOrientationChange = () => {
      const video = previewRef.current
      // #region agent log
      agentDebugLog(
        'LiveCameraBackground.tsx:orientationchange',
        'preview state on rotate',
        {
          hasStream: Boolean(streamRef.current),
          hasSrcObject: Boolean(video?.srcObject),
          videoWidth: video?.videoWidth ?? 0,
          videoHeight: video?.videoHeight ?? 0,
          layoutWidth: window.innerWidth,
          layoutHeight: window.innerHeight,
        },
        'H-O3',
      )
      // #endregion
    }

    window.addEventListener('orientationchange', onOrientationChange)
    return () => window.removeEventListener('orientationchange', onOrientationChange)
  }, [previewRef, streamRef])

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
        className={`camera-preview camera-preview--mirror camera-preview--live ${
          isAudioMode ? 'camera-preview--hidden' : ''
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
        className={`camera-background-overlay pointer-events-none bg-gradient-to-b from-black/10 via-transparent to-black/25 ${
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
    prev.pitchStageActive === next.pitchStageActive,
)

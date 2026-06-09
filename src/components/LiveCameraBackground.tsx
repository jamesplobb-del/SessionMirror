import { memo, useEffect, type RefObject, type VideoHTMLAttributes } from 'react'
import { Mic } from 'lucide-react'
import type { RecordingMode } from '../types'
import { mobileVideoProps } from '../utils/mobileVideo'

interface LiveCameraBackgroundProps {
  previewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  error: string | null
  recordingMode: RecordingMode
  isRecording: boolean
}

function LiveCameraBackground({
  previewRef,
  streamRef,
  streamGeneration,
  error,
  recordingMode,
  isRecording,
}: LiveCameraBackgroundProps) {
  const isAudioMode = recordingMode === 'audio'

  useEffect(() => {
    const video = previewRef.current
    if (!video) return

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
  }, [previewRef, streamRef, recordingMode, streamGeneration])

  return (
    <div className="absolute inset-0 z-0">
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
        style={{ transform: isAudioMode ? undefined : 'scaleX(-1)' }}
        className={`absolute inset-0 z-0 h-[100dvh] w-full object-cover transition-opacity duration-300 ${
          isAudioMode ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      />

      {isAudioMode && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-gradient-to-b from-stone-950 via-stone-900 to-black">
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
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-stone-900">
          <p className="max-w-sm px-6 text-center text-sm text-white/70">{error}</p>
        </div>
      )}
      <div
        className={`pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/25 via-transparent to-black/45 transition-opacity duration-300 ${
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
    prev.isRecording === next.isRecording,
)

import { memo, useEffect, type RefObject, type VideoHTMLAttributes } from 'react'
import { mobileVideoProps } from '../utils/mobileVideo'

interface LiveCameraBackgroundProps {
  previewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  error: string | null
}

/**
 * Persistent live-camera layer (z-index 0). Modal/UI state must not affect this tree.
 * Stream binding runs once on mount via refs — no dependency on overlay state.
 */
function LiveCameraBackground({
  previewRef,
  streamRef,
  error,
}: LiveCameraBackgroundProps) {
  useEffect(() => {
    const video = previewRef.current
    if (!video) return

    let frameId = 0
    let stopped = false

    const attachStream = () => {
      if (stopped) return

      const stream = streamRef.current
      if (stream && video.srcObject !== stream) {
        video.srcObject = stream
        video.muted = true
        void video.play().catch(() => {
          /* autoplay may need a user gesture in some browsers */
        })
        return
      }

      if (!stream) {
        frameId = requestAnimationFrame(attachStream)
      }
    }

    attachStream()

    return () => {
      stopped = true
      cancelAnimationFrame(frameId)
    }
    // Mount-once: stream arrives asynchronously via streamRef, not React state.
  }, [])

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
        style={{ transform: 'scaleX(-1)' }}
        className="absolute inset-0 z-0 h-[100dvh] w-full object-cover"
      />
      {error && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-stone-900">
          <p className="max-w-sm px-6 text-center text-sm text-white/70">{error}</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/25 via-transparent to-black/45" />
    </div>
  )
}

export default memo(
  LiveCameraBackground,
  (prev, next) =>
    prev.previewRef === next.previewRef &&
    prev.streamRef === next.streamRef &&
    prev.error === next.error,
)

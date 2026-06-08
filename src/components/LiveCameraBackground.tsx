import { useEffect, useRef, type RefObject, type VideoHTMLAttributes } from 'react'
import { mobileVideoProps } from '../utils/mobileVideo'

const CAMERA_HARDWARE_RELEASE_MS = 700

interface LiveCameraBackgroundProps {
  previewRef: RefObject<HTMLVideoElement | null>
  stream: MediaStream | null
  error: string | null
  /** When false, hide instantly so CSS exit transitions never race hardware teardown. */
  isActive?: boolean
}

export default function LiveCameraBackground({
  previewRef,
  stream,
  error,
  isActive = true,
}: LiveCameraBackgroundProps) {
  const releaseTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const video = previewRef.current
    if (!video || !stream) return

    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    video.muted = true

    void video.play().catch(() => {
      /* autoplay may need a user gesture in some browsers */
    })

    return () => {
      video.pause()

      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current)
      }

      const videoEl = video
      const boundStream = stream

      releaseTimerRef.current = window.setTimeout(() => {
        releaseTimerRef.current = null

        if (videoEl.srcObject === boundStream) {
          videoEl.srcObject = null
        }
      }, CAMERA_HARDWARE_RELEASE_MS)
    }
  }, [previewRef, stream])

  return (
    <div
      className={`absolute inset-0 z-0 ${
        isActive
          ? 'opacity-100 transition-opacity duration-200 ease-in'
          : 'pointer-events-none opacity-0 transition-none'
      }`}
    >
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
        className="absolute inset-0 z-0 h-[100dvh] w-full object-cover transition-opacity duration-200 ease-in"
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

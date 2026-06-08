import { useEffect, type RefObject, type VideoHTMLAttributes } from 'react'
import { mobileVideoProps } from '../utils/mobileVideo'

interface LiveCameraBackgroundProps {
  previewRef: RefObject<HTMLVideoElement | null>
  stream: MediaStream | null
  error: string | null
}

export default function LiveCameraBackground({
  previewRef,
  stream,
  error,
}: LiveCameraBackgroundProps) {
  useEffect(() => {
    const video = previewRef.current
    if (!video || !stream) return

    video.srcObject = stream
    video.muted = true

    void video.play().catch(() => {
      /* autoplay may need a user gesture in some browsers */
    })

    return () => {
      video.pause()
      video.srcObject = null
    }
  }, [previewRef, stream])

  return (
    <div className="absolute inset-0 z-0 transition-opacity duration-200 ease-in">
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
        style={{ transform: 'scaleX(1)' }}
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

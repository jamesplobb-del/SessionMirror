import { useEffect, type RefObject } from 'react'
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
    <>
      <video
        ref={previewRef}
        autoPlay
        muted
        {...mobileVideoProps}
        className="absolute inset-0 z-0 h-[100dvh] w-full object-cover"
      />
      {error && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-stone-900">
          <p className="max-w-sm px-6 text-center text-sm text-white/70">{error}</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/25 via-transparent to-black/45" />
    </>
  )
}

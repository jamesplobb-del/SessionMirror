import { memo, type RefObject, type VideoHTMLAttributes } from 'react'
import { mobileVideoProps } from '../utils/mobileVideo'

interface LiveCameraBackgroundProps {
  previewRef: RefObject<HTMLVideoElement | null>
  error: string | null
}

/**
 * Persistent live-camera layer (z-index 0). Intentionally free of modal/UI state —
 * srcObject binding lives in useCameraSession so this tree never remounts on overlays.
 */
function LiveCameraBackground({ previewRef, error }: LiveCameraBackgroundProps) {
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

export default memo(LiveCameraBackground)

import type { RefObject, VideoHTMLAttributes } from 'react'
import { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
import { NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { iosTakeVideoProps, withWebKitThumbnailHint } from '../utils/mobileVideo'

export interface TakeVideoPlayerProps
  extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
  filePath: string
  videoUrl: string
  mimeType?: string
  videoRef?: RefObject<HTMLVideoElement | null>
  loadingClassName?: string
}

/**
 * Renders a saved take with a Capacitor WebView-safe URI on `<video src>`.
 * Raw file:/// paths are blocked — only capacitor:// / _capacitor_file_ URLs mount.
 */
export default function TakeVideoPlayer({
  filePath,
  videoUrl,
  mimeType: _mimeType = NATIVE_VIDEO_MIME,
  videoRef,
  className,
  loadingClassName = 'h-full w-full animate-pulse bg-stone-900',
  controls = true,
  ...rest
}: TakeVideoPlayerProps) {
  const playbackSrc = useCapacitorVideoSrc(filePath, videoUrl)

  if (!playbackSrc) {
    return <div className={loadingClassName} aria-hidden />
  }

  const videoSrc = withWebKitThumbnailHint(playbackSrc)

  return (
    <video
      ref={videoRef}
      className={`${className ?? ''} transition-opacity duration-200 ease-in`.trim()}
      src={videoSrc}
      {...rest}
      {...iosTakeVideoProps}
      playsInline
      {...({
        'webkit-playsinline': 'true',
      } as VideoHTMLAttributes<HTMLVideoElement>)}
      muted
      disablePictureInPicture
      controls={controls}
      preload="metadata"
    />
  )
}

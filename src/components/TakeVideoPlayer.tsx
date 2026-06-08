import type { RefObject, VideoHTMLAttributes } from 'react'
import { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
import { applyStrictPlaybackSrc, NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { mobileVideoProps } from '../utils/mobileVideo'

export interface TakeVideoPlayerProps
  extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
  filePath: string
  videoUrl: string
  mimeType?: string
  videoRef?: RefObject<HTMLVideoElement | null>
  loadingClassName?: string
}

/**
 * Renders a saved take with a WebView-safe URI and iOS-required playback attrs.
 * Uses `<source type="video/mp4">` so WebKit recognizes native recordings.
 */
export default function TakeVideoPlayer({
  filePath,
  videoUrl,
  mimeType = NATIVE_VIDEO_MIME,
  videoRef,
  className,
  loadingClassName = 'h-full w-full animate-pulse bg-stone-900',
  controls = true,
  ...rest
}: TakeVideoPlayerProps) {
  const resolved = useCapacitorVideoSrc(filePath, videoUrl)
  const playbackSrc = resolved ? applyStrictPlaybackSrc(resolved) : null

  if (!playbackSrc) {
    return <div className={loadingClassName} aria-hidden />
  }

  return (
    <video
      ref={videoRef}
      className={className}
      playsInline
      controls={controls}
      preload="metadata"
      {...mobileVideoProps}
      {...rest}
    >
      <source src={playbackSrc} type={mimeType} />
    </video>
  )
}

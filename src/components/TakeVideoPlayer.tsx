import { useEffect, useRef, type CSSProperties, type RefObject, type VideoHTMLAttributes } from 'react'
import { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
import { NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { iosTakeVideoProps, withWebKitThumbnailHint } from '../utils/mobileVideo'
import { pauseVideoElement } from '../utils/videoPlayback'

export interface TakeVideoPlayerProps
  extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
  filePath: string
  videoUrl: string
  mimeType?: string
  videoRef?: RefObject<HTMLVideoElement | null>
  loadingClassName?: string
  /** Mirror only the raw <video> pixels (scaleX(-1)); never flips sibling UI overlays. */
  mirror?: boolean
  /** Call video.load() on mount so WebKit eagerly fetches #t= poster frames. */
  eagerLoad?: boolean
  /** Vault list tile — muted poster only; never inline audio. */
  thumbnailPreview?: boolean
  preload?: 'auto' | 'metadata' | 'none'
}

/**
 * Renders a saved take with a Capacitor WebView-safe URI on `<video src>`.
 * Raw file:/// paths are blocked — only capacitor:// / _capacitor_file_ URLs mount.
 */
export default function TakeVideoPlayer({
  filePath,
  videoUrl,
  mimeType: _mimeType = NATIVE_VIDEO_MIME,
  videoRef: externalVideoRef,
  className,
  loadingClassName = 'h-full w-full animate-pulse bg-stone-900',
  controls = true,
  mirror = false,
  eagerLoad = false,
  thumbnailPreview = false,
  preload = 'metadata',
  style,
  ...rest
}: TakeVideoPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null)
  const videoRef = externalVideoRef ?? internalRef
  const playbackSrc = useCapacitorVideoSrc(filePath, videoUrl)

  const videoSrc = playbackSrc ? withWebKitThumbnailHint(playbackSrc) : null

  useEffect(() => {
    if (!eagerLoad || !videoSrc) return
    videoRef.current?.load()
  }, [eagerLoad, videoSrc, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSrc) return
    video.pause()
    video.muted = true
    video.currentTime = 0
  }, [videoSrc, videoRef])

  useEffect(() => {
    if (!thumbnailPreview) return
    const video = videoRef.current
    if (!video) return

    const enforceSilentPreview = () => {
      video.muted = true
    }

    video.addEventListener('volumechange', enforceSilentPreview)
    return () => {
      video.removeEventListener('volumechange', enforceSilentPreview)
    }
  }, [thumbnailPreview, videoSrc, videoRef])

  useEffect(() => {
    return () => {
      pauseVideoElement(videoRef.current)
    }
  }, [videoSrc, videoRef])

  if (!videoSrc) {
    return <div className={loadingClassName} aria-hidden />
  }

  const videoStyle: CSSProperties = mirror
    ? { transform: 'scaleX(-1)' }
    : { ...style }

  const videoElement = (
    <video
      ref={videoRef}
      className={`${className ?? ''} transition-opacity duration-200 ease-in`.trim()}
      src={videoSrc}
      style={videoStyle}
      {...rest}
      {...iosTakeVideoProps}
      playsInline
      {...({
        'webkit-playsinline': 'true',
      } as VideoHTMLAttributes<HTMLVideoElement>)}
      muted
      autoPlay={false}
      disablePictureInPicture
      controls={thumbnailPreview ? false : mirror ? false : controls}
      preload={preload}
    />
  )

  if (mirror && style) {
    return (
      <div className="h-full w-full" style={style}>
        {videoElement}
      </div>
    )
  }

  return videoElement
}

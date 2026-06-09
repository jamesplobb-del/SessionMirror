import { useEffect, useRef, type CSSProperties, type PointerEventHandler, type RefObject, type VideoHTMLAttributes } from 'react'
import { Mic } from 'lucide-react'
import { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
import { NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { iosTakeVideoProps, isAudioMimeType, withWebKitThumbnailHint } from '../utils/mobileVideo'
import { pauseVideoElement } from '../utils/videoPlayback'

export interface TakeVideoPlayerProps
  extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
  filePath: string
  videoUrl: string
  mimeType?: string
  videoRef?: RefObject<HTMLMediaElement | null>
  loadingClassName?: string
  mirror?: boolean
  eagerLoad?: boolean
  thumbnailPreview?: boolean
  manualPlayOnly?: boolean
  videoSourceKey?: string
  preload?: 'auto' | 'metadata' | 'none'
}

export default function TakeVideoPlayer({
  filePath,
  videoUrl,
  mimeType: mimeTypeProp = NATIVE_VIDEO_MIME,
  videoRef: externalVideoRef,
  className,
  loadingClassName = 'h-full w-full animate-pulse bg-stone-900',
  controls = true,
  mirror = false,
  eagerLoad = false,
  thumbnailPreview = false,
  manualPlayOnly = false,
  videoSourceKey,
  preload = 'metadata',
  style,
  ...rest
}: TakeVideoPlayerProps) {
  const internalRef = useRef<HTMLMediaElement>(null)
  const mediaRef = externalVideoRef ?? internalRef
  const playbackSrc = useCapacitorVideoSrc(filePath, videoUrl)
  const isAudio = isAudioMimeType(mimeTypeProp)

  const mediaSrc = playbackSrc
    ? isAudio
      ? playbackSrc
      : withWebKitThumbnailHint(playbackSrc)
    : null

  useEffect(() => {
    if (!eagerLoad || !mediaSrc) return
    mediaRef.current?.load()
  }, [eagerLoad, mediaSrc, mediaRef])

  useEffect(() => {
    if (manualPlayOnly) return
    const media = mediaRef.current
    if (!media || !mediaSrc) return
    media.pause()
    media.currentTime = 0
    if ('muted' in media) {
      media.muted = true
    }
  }, [mediaSrc, mediaRef, manualPlayOnly])

  useEffect(() => {
    if (manualPlayOnly) return
    return () => {
      pauseVideoElement(mediaRef.current)
    }
  }, [mediaSrc, mediaRef, manualPlayOnly])

  useEffect(() => {
    if (!thumbnailPreview) return
    const media = mediaRef.current
    if (!media) return

    const enforceSilentPreview = () => {
      if ('muted' in media) media.muted = true
    }

    const blockInlinePlayback = () => {
      media.pause()
      if ('muted' in media) media.muted = true
    }

    media.addEventListener('volumechange', enforceSilentPreview)
    media.addEventListener('play', blockInlinePlayback)
    return () => {
      media.removeEventListener('volumechange', enforceSilentPreview)
      media.removeEventListener('play', blockInlinePlayback)
    }
  }, [thumbnailPreview, mediaSrc, mediaRef])

  if (!mediaSrc) {
    return <div className={loadingClassName} aria-hidden />
  }

  if (isAudio) {
    const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, ...audioRest } = rest
    return (
      <div
        className={`relative h-full w-full bg-stone-950 ${className ?? ''}`.trim()}
        onPointerDown={onPointerDown as PointerEventHandler<HTMLDivElement> | undefined}
        onPointerMove={onPointerMove as PointerEventHandler<HTMLDivElement> | undefined}
        onPointerUp={onPointerUp as PointerEventHandler<HTMLDivElement> | undefined}
        onPointerCancel={onPointerCancel as PointerEventHandler<HTMLDivElement> | undefined}
      >
        <audio
          key={videoSourceKey ?? mediaSrc ?? 'empty-audio'}
          ref={mediaRef as RefObject<HTMLAudioElement>}
          className="sr-only"
          src={mediaSrc}
          preload={preload}
          {...audioRest}
          muted
          autoPlay={false}
        />
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
            thumbnailPreview ? '' : ''
          }`}
          aria-hidden
        >
          <Mic className="h-8 w-8 text-stone-500/80" />
        </div>
      </div>
    )
  }

  const videoStyle: CSSProperties = {
    pointerEvents: thumbnailPreview ? 'none' : undefined,
    ...(mirror ? { transform: 'scaleX(-1)' } : style),
  }

  const videoElement = (
    <video
      key={videoSourceKey ?? mediaSrc ?? 'empty'}
      ref={mediaRef as RefObject<HTMLVideoElement>}
      className={`${className ?? ''} transition-opacity duration-200 ease-in`.trim()}
      src={mediaSrc}
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

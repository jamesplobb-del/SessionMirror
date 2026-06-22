import { useEffect, useRef, useState, type CSSProperties, type PointerEventHandler, type RefObject, type VideoHTMLAttributes } from 'react'
import { Mic } from 'lucide-react'
import { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
import { NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { iosBulletproofVideoProps, isAudioMimeType, withWebKitThumbnailHint } from '../utils/mobileVideo'
import { ensureMediaMuted, prepareInlineMediaElement } from '../utils/mediaPlayback'
import { pauseVideoElement } from '../utils/videoPlayback'
import type { RecordingOrientation } from '../utils/physicalOrientation'
import {
  buildPlaybackShellStyle,
  shouldCorrectPlaybackOrientation,
  takeVideoShellClassName,
} from '../utils/takeVideoPlayback'

export interface TakeVideoPlayerProps
  extends Omit<
    VideoHTMLAttributes<HTMLVideoElement>,
    'src' | 'controls' | 'preload' | 'playsInline'
  > {
  filePath: string
  videoUrl: string
  mimeType?: string
  videoRef?: RefObject<HTMLMediaElement | null>
  loadingClassName?: string
  mirror?: boolean
  recordingOrientation?: RecordingOrientation
  fit?: 'cover' | 'contain'
  eagerLoad?: boolean
  thumbnailPreview?: boolean
  manualPlayOnly?: boolean
  /** Caller primes speaker routing before play when true (Review / PiP). */
  audible?: boolean
  mirroredControls?: boolean
  videoSourceKey?: string
}

export default function TakeVideoPlayer({
  filePath,
  videoUrl,
  mimeType: mimeTypeProp = NATIVE_VIDEO_MIME,
  videoRef: externalVideoRef,
  className,
  loadingClassName = 'h-full w-full animate-pulse bg-stone-900',
  mirror = false,
  recordingOrientation,
  fit = 'cover',
  eagerLoad = false,
  thumbnailPreview = false,
  manualPlayOnly = false,
  audible = false,
  mirroredControls: _mirroredControls = false,
  videoSourceKey,
  style,
  ...rest
}: TakeVideoPlayerProps) {
  const internalRef = useRef<HTMLMediaElement>(null)
  const mediaRef = externalVideoRef ?? internalRef
  const playbackSrc = useCapacitorVideoSrc(filePath, videoUrl)
  const isAudio = isAudioMimeType(mimeTypeProp)
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 })

  const mediaSrc = playbackSrc
    ? isAudio
      ? playbackSrc
      : withWebKitThumbnailHint(playbackSrc)
    : null

  useEffect(() => {
    if (!mediaSrc) return
    const media = mediaRef.current
    if (!media) return
    prepareInlineMediaElement(media)
    if (!audible) {
      ensureMediaMuted(media)
    }
    media.load()
  }, [audible, mediaSrc, mediaRef])

  useEffect(() => {
    if (!eagerLoad || !mediaSrc) return
    mediaRef.current?.load()
  }, [eagerLoad, mediaSrc, mediaRef])

  useEffect(() => {
    setVideoDimensions({ width: 0, height: 0 })
  }, [mediaSrc, videoSourceKey])

  useEffect(() => {
    if (manualPlayOnly || audible) return
    const media = mediaRef.current
    if (!media || !mediaSrc) return
    media.pause()
    media.currentTime = 0
    if ('muted' in media) {
      media.muted = true
    }
  }, [audible, mediaSrc, mediaRef, manualPlayOnly])

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
          {...audioRest}
          {...(audible ? {} : { muted: true })}
          autoPlay={false}
          playsInline
          preload="auto"
          {...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>)}
        />
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <Mic className="h-8 w-8 text-stone-500/80" />
        </div>
      </div>
    )
  }

  const needsLandscapeFix = shouldCorrectPlaybackOrientation(
    recordingOrientation,
    videoDimensions.width,
    videoDimensions.height,
  )

  const shellClassName = takeVideoShellClassName({
    needsLandscapeFix,
    mirror,
    fit,
    thumbnailPreview,
  })

  const shellStyle = needsLandscapeFix
    ? buildPlaybackShellStyle(videoDimensions.width, videoDimensions.height)
    : undefined

  const videoStyle: CSSProperties = {
    pointerEvents: thumbnailPreview ? 'none' : undefined,
    ...(needsLandscapeFix || mirror ? {} : style),
  }

  const { onLoadedMetadata, ...videoRest } = rest

  const videoElement = (
    <video
      key={videoSourceKey ?? mediaSrc ?? 'empty'}
      ref={mediaRef as RefObject<HTMLVideoElement>}
      className={`take-video-shell__media media-display-enhance ${className ?? ''} transition-opacity duration-200 ease-in`.trim()}
      src={mediaSrc}
      style={videoStyle}
      onLoadedMetadata={(event) => {
        const media = event.currentTarget
        setVideoDimensions({
          width: media.videoWidth,
          height: media.videoHeight,
        })
        onLoadedMetadata?.(event)
      }}
      {...videoRest}
      {...(audible ? {} : { muted: true })}
      autoPlay={false}
      {...iosBulletproofVideoProps}
    />
  )

  if (needsLandscapeFix || mirror) {
    return (
      <div
        className={shellClassName}
        style={{ ...shellStyle, ...(style ?? undefined) }}
      >
        {videoElement}
      </div>
    )
  }

  return videoElement
}

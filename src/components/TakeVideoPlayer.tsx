import { useEffect, useRef, useState, type CSSProperties, type PointerEventHandler, type RefObject, type VideoHTMLAttributes } from 'react'
import { Mic } from 'lucide-react'
import { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
import { NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { iosBulletproofVideoProps, isAudioMimeType, withWebKitThumbnailHint } from '../utils/mobileVideo'
import { ensureMediaMuted, prepareInlineMediaElement } from '../utils/mediaPlayback'
import {
  hasTakePlaybackSpeakerRoute,
} from '../utils/takePlaybackSpeaker'
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
  preload?: 'none' | 'metadata' | 'auto'
}

export default function TakeVideoPlayer({
  filePath,
  videoUrl,
  mimeType: mimeTypeProp = NATIVE_VIDEO_MIME,
  videoRef: externalVideoRef,
  className,
  loadingClassName = 'h-full w-full animate-pulse bg-black',
  mirror = false,
  recordingOrientation,
  fit = 'cover',
  eagerLoad = false,
  thumbnailPreview = false,
  manualPlayOnly = false,
  audible = false,
  mirroredControls: _mirroredControls = false,
  videoSourceKey,
  preload: preloadProp = 'none',
  style,
  ...rest
}: TakeVideoPlayerProps) {
  const internalRef = useRef<HTMLMediaElement>(null)
  const mediaRef = externalVideoRef ?? internalRef
  const playbackSrc = useCapacitorVideoSrc(filePath, videoUrl)
  const isAudio = isAudioMimeType(mimeTypeProp)
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 })
  const loadedSrcRef = useRef<string | null>(null)

  const hasPlaybackTarget = Boolean(filePath || videoUrl)
  const mediaSrc = playbackSrc
    ? isAudio
      ? playbackSrc
      : withWebKitThumbnailHint(playbackSrc)
    : null

  const effectivePreload = eagerLoad ? 'metadata' : preloadProp

  useEffect(() => {
    if (!mediaSrc) return
    const media = mediaRef.current
    if (!media) return

    if (loadedSrcRef.current === mediaSrc) {
      media.preload = effectivePreload
      return
    }

    loadedSrcRef.current = mediaSrc
    prepareInlineMediaElement(media, { preload: effectivePreload })
    ensureMediaMuted(media)
    media.load()
  }, [mediaSrc, mediaRef])

  useEffect(() => {
    const media = mediaRef.current
    if (!media || !mediaSrc) return
    media.preload = effectivePreload
  }, [effectivePreload, mediaSrc, mediaRef])

  useEffect(() => {
    if (mediaSrc) return
    loadedSrcRef.current = null
  }, [mediaSrc])

  useEffect(() => {
    setVideoDimensions({ width: 0, height: 0 })
  }, [mediaSrc, videoSourceKey])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    if (audible && mediaSrc) {
      if (!hasTakePlaybackSpeakerRoute(media)) {
        media.muted = false
        if (media.volume <= 0) {
          media.volume = 1
        }
      } else {
        ensureMediaMuted(media)
      }
      return
    }

    if (!mediaSrc) return
    ensureMediaMuted(media)
    if (manualPlayOnly) {
      media.pause()
    }
  }, [audible, manualPlayOnly, mediaSrc, mediaRef])

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

  if (!mediaSrc && !hasPlaybackTarget) {
    return <div className={loadingClassName} aria-hidden />
  }

  if (isAudio) {
    const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, ...audioRest } = rest
    return (
      <div
        className={`relative h-full w-full bg-black ${className ?? ''}`.trim()}
        onPointerDown={onPointerDown as PointerEventHandler<HTMLDivElement> | undefined}
        onPointerMove={onPointerMove as PointerEventHandler<HTMLDivElement> | undefined}
        onPointerUp={onPointerUp as PointerEventHandler<HTMLDivElement> | undefined}
        onPointerCancel={onPointerCancel as PointerEventHandler<HTMLDivElement> | undefined}
      >
        <audio
          key={videoSourceKey ?? mediaSrc ?? filePath ?? 'empty-audio'}
          ref={mediaRef as RefObject<HTMLAudioElement>}
          className="sr-only"
          src={mediaSrc ?? undefined}
          {...audioRest}
          autoPlay={false}
          playsInline
          preload={effectivePreload}
          {...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>)}
        />
        {!mediaSrc && (
          <div className={`pointer-events-none absolute inset-0 ${loadingClassName}`} aria-hidden />
        )}
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
      key={videoSourceKey ?? mediaSrc ?? filePath ?? 'empty'}
      ref={mediaRef as RefObject<HTMLVideoElement>}
      className={`take-video-shell__media media-display-enhance ${className ?? ''} ${!mediaSrc ? loadingClassName : ''} transition-opacity duration-200 ease-in`.trim()}
      src={mediaSrc ?? undefined}
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
      {...iosBulletproofVideoProps}
      preload={effectivePreload}
      autoPlay={false}
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

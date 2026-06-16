import { useEffect, useRef, useState, type CSSProperties, type PointerEventHandler, type RefObject, type VideoHTMLAttributes } from 'react'
import { Mic } from 'lucide-react'
import { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
import { NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { isAudioMimeType, withWebKitThumbnailHint } from '../utils/mobileVideo'
import { pauseVideoElement } from '../utils/videoPlayback'
import { prepareInlineMediaElement } from '../utils/mediaPlayback'
import { primeTakePlaybackAudio, releaseTakePlaybackAudio } from '../utils/takePlaybackAudio'
import type { RecordingOrientation } from '../utils/physicalOrientation'
import {
  buildPlaybackShellStyle,
  shouldCorrectPlaybackOrientation,
  takeVideoShellClassName,
} from '../utils/takeVideoPlayback'

export interface TakeVideoPlayerProps
  extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
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
  /** Play audio through the device speaker (default muted for PiP previews). */
  audible?: boolean
  /** Show native controls on mirrored recorded takes. */
  mirroredControls?: boolean
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
  recordingOrientation,
  fit = 'cover',
  eagerLoad = false,
  thumbnailPreview = false,
  manualPlayOnly = false,
  audible = false,
  mirroredControls = false,
  videoSourceKey,
  preload = 'metadata',
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
    if (!eagerLoad || !mediaSrc) return
    mediaRef.current?.load()
  }, [eagerLoad, mediaSrc, mediaRef])

  useEffect(() => {
    setVideoDimensions({ width: 0, height: 0 })
  }, [mediaSrc, videoSourceKey])

  useEffect(() => {
    if (!audible || !mediaSrc) return
    const media = mediaRef.current
    if (!media) return

    const ensureAudible = () => {
      prepareInlineMediaElement(media)
      void primeTakePlaybackAudio(media)
    }

    ensureAudible()
    media.addEventListener('play', ensureAudible)
    media.addEventListener('loadeddata', ensureAudible)

    const releaseAudible = () => {
      void releaseTakePlaybackAudio()
    }
    media.addEventListener('pause', releaseAudible)
    media.addEventListener('ended', releaseAudible)

    return () => {
      media.removeEventListener('play', ensureAudible)
      media.removeEventListener('loadeddata', ensureAudible)
      media.removeEventListener('pause', releaseAudible)
      media.removeEventListener('ended', releaseAudible)
    }
  }, [audible, mediaSrc, mediaRef])

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
          preload={preload}
          {...audioRest}
          muted={!audible}
          autoPlay={false}
          playsInline
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

  const replayElementProps = {
    playsInline: true,
    disablePictureInPicture: true,
    ...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>),
    ...(audible ? {} : { muted: true as const }),
  }

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
      {...replayElementProps}
      muted={!audible}
      autoPlay={false}
      controls={
        thumbnailPreview ? false : mirror && !mirroredControls ? false : controls
      }
      preload={preload}
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

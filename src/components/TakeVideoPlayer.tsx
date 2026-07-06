import { useEffect, useRef, useState, type CSSProperties, type PointerEventHandler, type RefObject, type VideoHTMLAttributes } from 'react'
import { Mic } from 'lucide-react'
import { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
import { NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { iosBulletproofVideoProps, isAudioMimeType, withWebKitThumbnailHint } from '../utils/mobileVideo'
import { ensureMediaMuted, prepareInlineMediaElement } from '../utils/mediaPlayback'
import { pauseVideoElement } from '../utils/videoPlayback'
import { finalizeTakePlaybackCleanup } from '../utils/takePlaybackAudio'
import { hasTakePlaybackSpeakerRoute } from '../utils/takePlaybackSpeaker'
import type { RecordingOrientation } from '../utils/physicalOrientation'
import {
  buildPlaybackShellStyle,
  shouldCorrectPlaybackOrientation,
  takeVideoShellClassName,
} from '../utils/takeVideoPlayback'

type FrameWatchVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: { presentedFrames?: number }) => void,
  ) => number
  cancelVideoFrameCallback?: (handle: number) => void
  webkitDecodedFrameCount?: number
}

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
  loadingClassName: loadingClassNameProp,
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
  const loadingClassName =
    loadingClassNameProp ??
    (isAudio ? 'h-full w-full animate-pulse take-audio-surface' : 'h-full w-full animate-pulse bg-black')
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
    if (isAudio || thumbnailPreview) return
    const media = mediaRef.current as FrameWatchVideo | null
    if (!media) return

    let stopped = false
    let frameCallbackId: number | null = null
    let intervalId: number | null = null
    let lastPresentedFrames =
      media.webkitDecodedFrameCount ?? media.getVideoPlaybackQuality?.().totalVideoFrames ?? 0
    let lastMediaTime = media.currentTime || 0
    let lastFrameAt = performance.now()
    let lastNudgeAt = 0

    const readPresentedFrames = () =>
      media.webkitDecodedFrameCount ?? media.getVideoPlaybackQuality?.().totalVideoFrames ?? lastPresentedFrames

    const nudgeVideoDecoder = () => {
      const now = performance.now()
      if (now - lastNudgeAt < 1600) return
      lastNudgeAt = now

      const duration = Number.isFinite(media.duration) ? media.duration : 0
      const current = media.currentTime || 0
      const target = duration > 0
        ? Math.min(Math.max(0, duration - 0.05), current + 0.015)
        : current + 0.015

      try {
        media.currentTime = target
        if (!media.paused && !media.ended) {
          void media.play().catch(() => undefined)
        }
      } catch {
        /* ignore decoder recovery failures */
      }
    }

    const sample = () => {
      if (stopped || media.paused || media.ended || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        lastMediaTime = media.currentTime || 0
        lastPresentedFrames = readPresentedFrames()
        lastFrameAt = performance.now()
        return
      }

      const now = performance.now()
      const currentTime = media.currentTime || 0
      const presentedFrames = readPresentedFrames()
      const timeAdvanced = currentTime - lastMediaTime > 0.18
      const framesAdvanced = presentedFrames > lastPresentedFrames

      if (framesAdvanced) {
        lastPresentedFrames = presentedFrames
        lastFrameAt = now
      } else if (timeAdvanced && now - lastFrameAt > 1250) {
        nudgeVideoDecoder()
        lastFrameAt = now
      }

      lastMediaTime = currentTime
    }

    const scheduleFrameWatch = () => {
      if (stopped || !media.requestVideoFrameCallback) return
      frameCallbackId = media.requestVideoFrameCallback((_now, metadata) => {
        if (typeof metadata.presentedFrames === 'number') {
          lastPresentedFrames = metadata.presentedFrames
          lastFrameAt = performance.now()
        }
        scheduleFrameWatch()
      })
    }

    scheduleFrameWatch()
    intervalId = window.setInterval(sample, 350)

    return () => {
      stopped = true
      if (frameCallbackId !== null) {
        media.cancelVideoFrameCallback?.(frameCallbackId)
      }
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [isAudio, mediaRef, mediaSrc, thumbnailPreview, videoSourceKey])

  useEffect(() => {
    setVideoDimensions({ width: 0, height: 0 })
  }, [mediaSrc, videoSourceKey])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    if (audible && mediaSrc) {
      // Output flows through the Web Audio speaker bus; keep the element unmuted
      // so iOS keeps decoding it (muted elements get throttled → 1s cutout).
      media.muted = false
      if (media.volume <= 0) {
        media.volume = 1
      }
      return
    }

    if (hasTakePlaybackSpeakerRoute(media)) {
      media.muted = false
      if (media.volume <= 0) {
        media.volume = 1
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
    return () => {
      const media = mediaRef.current
      const wasActive = Boolean(media && !media.paused && !media.ended)
      pauseVideoElement(media)
      if (manualPlayOnly && wasActive) {
        void finalizeTakePlaybackCleanup()
      }
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
        className={`relative h-full w-full ${isAudio ? 'take-audio-surface' : 'bg-black'} ${className ?? ''}`.trim()}
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
          <Mic className="h-8 w-8 text-[#6c7077]/80" />
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

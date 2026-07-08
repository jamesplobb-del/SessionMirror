import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type CSSProperties,
} from 'react'
import { Maximize2, Minimize2, Play, Pause, Upload, X, Youtube } from 'lucide-react'
import TakeVideoPlayer from './TakeVideoPlayer'
import MiniPipControls from './MiniPipControls'
import Pressable from './ui/Pressable'
import YoutubeUrlDialog from './YoutubeUrlDialog'
import { stopEventBubble, touchBubbleBlockProps } from '../utils/eventBubbling'
import {
  finalizeInlineTakeBoxPlaybackCleanup,
  playInlineTakeBoxFromUserGesture,
} from '../utils/takePlaybackAudio'
import {
  ensureYoutubePlaybackListener,
  maintainYoutubeProxyLoudness,
  pauseYoutubeProxy,
  startYoutubeProxyPlayback,
} from '../utils/playalong/youtubeBridge'
import {
  isNativeInlineTakeBoxPlaybackAvailable,
  measureInlineTakeBoxWindowRect,
  setNativeInlineTakeBoxEndedHandler,
  setNativeInlineTakeBoxVolume,
  startNativeInlineTakeBoxPlayback,
  stopNativeInlineTakeBoxPlayback,
  teardownNativeInlineTakeBoxListener,
  updateNativeInlineTakeBoxLayout,
} from '../utils/nativeInlineTakeBoxPlayback'
import {
  prepareInlineTakeBoxPlaybackRoute,
  releaseInlineTakeBoxPlaybackRoute,
} from '../utils/playbackRouteCoordinator'
import { waitForMediaElement, waitForMediaReadyWithRetry } from '../utils/mediaPlayback'
import { updateTakePlaybackSpeakerGain } from '../utils/takePlaybackSpeaker'
import { useTutorialAction } from '../context/TutorialContext'
import { triggerLightHaptic } from '../utils/haptics'
import { parseYoutubeVideoId } from '../utils/youtubeEmbed'
import type { Take } from '../types'
import type { LibraryPlaybackReference } from '../types/library'
import { HUD_GLASS_FLOAT_BADGE, HUD_GLASS_PIP_PLAY_ICON } from '../utils/interactiveUx'
import { AUDIO_TAKE_THUMBNAIL } from '../utils/mediaType'
import { isAudioMimeType } from '../utils/mobileVideo'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'

const CHROME_BADGE_BTN = `${HUD_GLASS_FLOAT_BADGE} hud-glass-badge--ghost`

const NATIVE_TAKE_BOX_OWNER = 'best-take-box'

const emptyActionClass =
  'pip-empty-action pip-empty-action--interactive pointer-events-auto flex flex-1 items-center justify-center gap-1.5'

function PipMediaPoster({
  posterUrl,
  isAudio = false,
}: {
  posterUrl?: string | null
  isAudio?: boolean
}) {
  return (
    <div
      className={`absolute inset-0 h-full w-full ${isAudio ? 'take-audio-surface' : 'bg-black'}`}
      aria-hidden
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          className="pointer-events-none h-full w-full object-cover"
          draggable={false}
          decoding="async"
        />
      ) : null}
    </div>
  )
}

export interface BestTakeBoxProps {
  layout: 'pip' | 'fill'
  take: Take | null
  libraryPlayback?: LibraryPlaybackReference | null
  youtubeEmbedUrl: string | null
  suspendPlayback?: boolean
  videoRef?: RefObject<HTMLMediaElement | null>
  dropHighlight?: boolean
  onUnpinTake: () => void
  onClearLibraryReference?: () => void
  onClearYoutube: () => void
  onSubmitYoutube: (embedUrl: string) => void
  onUpload?: (file: File) => void
  onToggleSplitView?: () => void
  splitViewActive?: boolean
  onExpand?: () => void
  onPlaybackChange?: (playing: boolean) => void
  onYoutubeHostChange?: (el: HTMLDivElement | null) => void
  youtubeIframeRef?: RefObject<HTMLIFrameElement | null>
  dragSourceActive?: boolean
  dragSourceArming?: boolean
  dragSourceProps?: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    onPointerMove: (event: PointerEvent<HTMLElement>) => void
    onPointerUp: (event: PointerEvent<HTMLElement>) => void
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void
    style?: CSSProperties
  }
}

function BestTakeBox({
  layout,
  take,
  libraryPlayback = null,
  youtubeEmbedUrl,
  suspendPlayback = false,
  videoRef: externalVideoRef,
  dropHighlight = false,
  onUnpinTake,
  onClearLibraryReference,
  onClearYoutube,
  onSubmitYoutube,
  onUpload,
  onToggleSplitView,
  splitViewActive = false,
  onExpand,
  onPlaybackChange,
  onYoutubeHostChange,
  youtubeIframeRef,
  dragSourceActive = false,
  dragSourceArming = false,
  dragSourceProps,
}: BestTakeBoxProps) {
  const librarySrc = libraryPlayback?.playbackUrl ?? null
  const src = librarySrc || take?.videoUrl || null
  const playbackFilePath = libraryPlayback?.filePath || take?.filePath || ''
  const playbackMimeType =
    libraryPlayback?.mimeType ??
    take?.videoMimeType ??
    (take?.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
  const videoSourceKey = src || playbackFilePath || youtubeEmbedUrl || 'empty'
  const internalVideoRef = useRef<HTMLMediaElement>(null)
  const videoRef = externalVideoRef ?? internalVideoRef
  const playbackStageRef = useRef<HTMLDivElement>(null)
  const youtubeHostLocalRef = useRef<HTMLDivElement | null>(null)
  const lastYoutubeTapAtRef = useRef(0)
  const nativePlayInFlightRef = useRef(false)
  /** True only while this instance holds the shared stereo-playback route (native path). */
  const nativeRouteHeldRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayArmed, setIsPlayArmed] = useState(false)
  const [isYoutubePlaying, setIsYoutubePlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false)
  const notifyTutorial = useTutorialAction()

  const hasLibraryPlayback = Boolean(librarySrc || libraryPlayback?.filePath)
  const hasTake = Boolean(hasLibraryPlayback || take?.videoUrl || take?.filePath)
  const useNativeTakePlayback =
    isNativeInlineTakeBoxPlaybackAvailable() && Boolean(playbackFilePath)
  const mirrorPlayback = !hasLibraryPlayback && take?.mirrorPlayback === true
  const hasYoutube = Boolean(youtubeEmbedUrl)
  const hasReference = hasTake || hasYoutube
  const isFill = layout === 'fill'
  const youtubeVideoId = youtubeEmbedUrl ? parseYoutubeVideoId(youtubeEmbedUrl) : null
  const youtubePosterUrl = youtubeVideoId
    ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`
    : null
  const showYoutubePipOverlay = hasYoutube && !isFill && !suspendPlayback

  const showUploadBadge = Boolean(onUpload) && hasTake && !hasLibraryPlayback

  const handleYoutubeHostRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (youtubeHostLocalRef.current === el) return
      youtubeHostLocalRef.current = el
      onYoutubeHostChange?.(el)
    },
    [onYoutubeHostChange],
  )

  const resolveYoutubeIframe = useCallback(() => {
    if (youtubeIframeRef?.current) return youtubeIframeRef.current
    return (
      youtubeHostLocalRef.current?.querySelector<HTMLIFrameElement>(
        'iframe.youtube-embed-iframe, iframe',
      ) ?? null
    )
  }, [youtubeIframeRef])

  useEffect(() => {
    if (youtubeDialogOpen) {
      notifyTutorial?.('youtube-opened')
    }
  }, [notifyTutorial, youtubeDialogOpen])

  useEffect(() => {
    setIsPlaying(false)
    setIsPlayArmed(false)
    void stopNativeInlineTakeBoxPlayback({ notify: false, ownerId: NATIVE_TAKE_BOX_OWNER })
    // Only release the shared stereo route if this instance actually holds it —
    // this effect also runs on mount/every source change, and an unconditional
    // release here would decrement a hold owned by YouTube or another box.
    if (nativeRouteHeldRef.current) {
      nativeRouteHeldRef.current = false
      void releaseInlineTakeBoxPlaybackRoute()
    }
  }, [videoSourceKey, suspendPlayback])

  useEffect(() => {
    if (!hasYoutube || !youtubeIframeRef?.current) return

    maintainYoutubeProxyLoudness(youtubeIframeRef.current, 1)

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      maintainYoutubeProxyLoudness(youtubeIframeRef.current, 1)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [hasYoutube, youtubeEmbedUrl, youtubeIframeRef])

  useEffect(() => {
    if (!hasYoutube || !suspendPlayback) return
    pauseYoutubeProxy(youtubeIframeRef?.current)
    setIsYoutubePlaying(false)
  }, [hasYoutube, suspendPlayback, youtubeEmbedUrl, youtubeIframeRef])

  useEffect(() => {
    if (!hasYoutube || isFill) {
      setIsYoutubePlaying(false)
      return
    }

    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return
      let payload: { event?: string; state?: string }
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (payload.event !== 'youtube-state') return
      if (payload.state === 'playing') {
        setIsYoutubePlaying(true)
      } else if (payload.state === 'paused' || payload.state === 'ended') {
        setIsYoutubePlaying(false)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [hasYoutube, isFill])

  useEffect(() => {
    if (useNativeTakePlayback) return
    const media = videoRef.current
    if (!media || !hasTake) return

    const syncPlaying = () => {
      setIsPlaying(!media.paused && !media.ended)
    }

    media.addEventListener('play', syncPlaying)
    media.addEventListener('pause', syncPlaying)
    media.addEventListener('ended', syncPlaying)

    return () => {
      media.removeEventListener('play', syncPlaying)
      media.removeEventListener('pause', syncPlaying)
      media.removeEventListener('ended', syncPlaying)
    }
  }, [hasTake, useNativeTakePlayback, videoRef, videoSourceKey])

  useEffect(() => {
    if (!useNativeTakePlayback) return

    setNativeInlineTakeBoxEndedHandler(NATIVE_TAKE_BOX_OWNER, () => {
      setIsPlaying(false)
      setIsPlayArmed(false)
      if (nativeRouteHeldRef.current) {
        nativeRouteHeldRef.current = false
        void releaseInlineTakeBoxPlaybackRoute()
      }
    })

    return () => {
      setNativeInlineTakeBoxEndedHandler(NATIVE_TAKE_BOX_OWNER, null)
      void stopNativeInlineTakeBoxPlayback({ notify: false, ownerId: NATIVE_TAKE_BOX_OWNER })
      if (nativeRouteHeldRef.current) {
        nativeRouteHeldRef.current = false
        void releaseInlineTakeBoxPlaybackRoute()
      }
      void teardownNativeInlineTakeBoxListener()
    }
  }, [useNativeTakePlayback])

  useEffect(() => {
    if (!useNativeTakePlayback || !isPlaying) return
    const stage = playbackStageRef.current
    if (!stage) return

    const syncLayout = () => {
      const layout = measureInlineTakeBoxWindowRect(stage)
      if (layout) {
        void updateNativeInlineTakeBoxLayout(layout)
      }
    }

    syncLayout()
    const observer = new ResizeObserver(syncLayout)
    observer.observe(stage)
    window.addEventListener('scroll', syncLayout, true)
    window.addEventListener('resize', syncLayout)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', syncLayout, true)
      window.removeEventListener('resize', syncLayout)
    }
  }, [isPlaying, useNativeTakePlayback, layout, splitViewActive])

  useEffect(() => {
    onPlaybackChange?.(isPlaying)
  }, [isPlaying, onPlaybackChange])

  useEffect(() => {
    if (!suspendPlayback || !hasTake) return
    if (useNativeTakePlayback) {
      void stopNativeInlineTakeBoxPlayback({ notify: false, ownerId: NATIVE_TAKE_BOX_OWNER })
      if (nativeRouteHeldRef.current) {
        nativeRouteHeldRef.current = false
        void releaseInlineTakeBoxPlaybackRoute()
      }
      setIsPlaying(false)
      return
    }
    const media = videoRef.current
    if (!media) return
    media.pause()
    setIsPlaying(false)
  }, [hasTake, suspendPlayback, useNativeTakePlayback, videoRef, videoSourceKey])

  const posterUrl =
    take?.thumbnailUrl ??
    (hasLibraryPlayback || take?.mediaType === 'audio' ? AUDIO_TAKE_THUMBNAIL : null)

  const handlePlayPauseClick = useCallback(
    (event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      stopEventBubble(event)
      if (suspendPlayback || !hasTake) return

      if (useNativeTakePlayback) {
        if (isPlaying) {
          void stopNativeInlineTakeBoxPlayback({ notify: false, ownerId: NATIVE_TAKE_BOX_OWNER })
          if (nativeRouteHeldRef.current) {
            nativeRouteHeldRef.current = false
            void releaseInlineTakeBoxPlaybackRoute()
          }
          setIsPlaying(false)
          setIsPlayArmed(false)
          return
        }
        if (nativePlayInFlightRef.current) return

        const layout = measureInlineTakeBoxWindowRect(playbackStageRef.current)
        if (!layout) return

        setIsPlayArmed(true)
        void (async () => {
          nativePlayInFlightRef.current = true
          try {
            await prepareInlineTakeBoxPlaybackRoute()
            nativeRouteHeldRef.current = true
            const started = await startNativeInlineTakeBoxPlayback({
              filePath: playbackFilePath,
              layout,
              mirror: mirrorPlayback,
              volume,
              ownerId: NATIVE_TAKE_BOX_OWNER,
            })
            if (!started) {
              nativeRouteHeldRef.current = false
              setIsPlayArmed(false)
              await releaseInlineTakeBoxPlaybackRoute()
            }
            setIsPlaying(started)
            if (!started) setIsPlayArmed(false)
          } finally {
            nativePlayInFlightRef.current = false
          }
        })()
        return
      }

      if (isPlaying) {
        const video = videoRef.current
        video?.pause()
        void finalizeInlineTakeBoxPlaybackCleanup()
        setIsPlaying(false)
        setIsPlayArmed(false)
        return
      }

      setIsPlayArmed(true)

      void (async () => {
        const media = (await waitForMediaElement(videoRef)) ?? videoRef.current
        if (!media) {
          setIsPlaying(false)
          return
        }

        const hasSource = Boolean(media.src || media.currentSrc || media.readyState > 0)
        if (!hasSource) {
          const ready = await waitForMediaReadyWithRetry(media)
          if (!ready) {
            setIsPlaying(false)
            return
          }
        }

        playInlineTakeBoxFromUserGesture(media, {
          onPlaying: () => setIsPlaying(true),
          onFailure: () => {
            setIsPlaying(false)
            setIsPlayArmed(false)
            void finalizeInlineTakeBoxPlaybackCleanup()
          },
        })
      })()
    },
    [
      hasTake,
      isPlaying,
      mirrorPlayback,
      playbackFilePath,
      suspendPlayback,
      useNativeTakePlayback,
      videoRef,
      volume,
    ],
  )

  const handleYoutubePipPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (event.button !== 0) return

      const now = performance.now()
      if (now - lastYoutubeTapAtRef.current < 450) return
      lastYoutubeTapAtRef.current = now

      if (suspendPlayback || !hasYoutube || isFill) return

      const iframe = resolveYoutubeIframe()
      if (!iframe) return

      triggerLightHaptic()
      notifyTutorial?.('media-touched')
      ensureYoutubePlaybackListener()

      if (isYoutubePlaying) {
        pauseYoutubeProxy(iframe)
        setIsYoutubePlaying(false)
        return
      }

      startYoutubeProxyPlayback(iframe, volume)
      setIsYoutubePlaying(true)
    },
    [
      hasYoutube,
      isFill,
      isYoutubePlaying,
      notifyTutorial,
      resolveYoutubeIframe,
      suspendPlayback,
      volume,
    ],
  )

  const handleVolume = useCallback(
    (value: number) => {
      setVolume(value)
      if (useNativeTakePlayback && isPlaying) {
        void setNativeInlineTakeBoxVolume(value)
        return
      }
      const video = videoRef.current
      if (!video) return
      video.volume = value
      updateTakePlaybackSpeakerGain(video, value, false)
    },
    [isPlaying, useNativeTakePlayback, videoRef],
  )

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) {
        notifyTutorial?.('media-touched')
        onUpload?.(file)
      }
    },
    [notifyTutorial, onUpload],
  )

  const handleClearReference = useCallback(() => {
    if (hasYoutube) onClearYoutube()
    else if (hasLibraryPlayback) onClearLibraryReference?.()
    else onUnpinTake()
  }, [hasLibraryPlayback, hasYoutube, onClearLibraryReference, onClearYoutube, onUnpinTake])

  const pipTouchTargetClass =
    'pointer-events-auto z-[5] flex min-h-11 min-w-11 items-center justify-center p-3'
  const pipTouchIconClass = HUD_GLASS_PIP_PLAY_ICON

  const isAudioMedia = isAudioMimeType(playbackMimeType)
  const mediaStageClass = isAudioMedia ? 'take-audio-surface' : 'bg-black/95'

  const playbackFit =
    isFill && take?.recordingOrientation === 'landscape' ? 'contain' : 'cover'

  const playbackAudible = (isPlayArmed || isPlaying) && !suspendPlayback && hasTake

  const shellClass = isFill
    ? 'relative h-full w-full min-h-0 overflow-hidden'
    : 'pip-video-container group relative aspect-video'

  const innerClass = isFill
    ? `group relative z-0 h-full w-full overflow-hidden ${mediaStageClass} ring-1 ring-amber-400/50 ${
        hasReference ? 'opacity-100' : 'opacity-90'
      } ${dragSourceActive ? 'pip-drag-source--active' : ''} ${
        dragSourceArming ? 'pip-drag-source--arming' : ''
      }`
    : `group relative z-0 h-full w-full overflow-hidden rounded-xl border-[0.5px] ${mediaStageClass} shadow-lg shadow-black/50 ring-1 ring-amber-400/50 transition-opacity duration-200 ease-in ${
        hasReference ? 'opacity-100' : 'opacity-90'
      } ${dropHighlight ? 'pip-drop-target--active border-amber-400/80' : 'border-white/10'} ${
        dragSourceActive ? 'pip-drag-source--active' : ''
      } ${dragSourceArming ? 'pip-drag-source--arming' : ''}`

  /** Inner clip — native AVPlayer targets this so the shell ring/border stay visible. */
  const nativePlaybackStageClass = isFill
    ? 'absolute inset-0 overflow-hidden'
    : 'absolute inset-0 overflow-hidden rounded-xl'

  const pillLeft = showUploadBadge ? 36 : 8

  const cornerInset = isFill ? (splitViewActive ? 3 : 6) : 2
  const pipControlsClearance = 0

  const renderClearButton = () => {
    if (!hasReference) return null

    return (
      <Pressable
        type="button"
        intensity="icon"
        squish={false}
        haptic="light"
        onPointerDown={stopEventBubble}
        onTouchStart={stopEventBubble}
        onTouchEnd={stopEventBubble}
        onClick={(e) => {
          e.stopPropagation()
          handleClearReference()
        }}
        className={`${CHROME_BADGE_BTN} pip-chrome-btn pip-chrome-btn--clear`}
        style={{ top: cornerInset, right: cornerInset }}
        aria-label={hasYoutube ? 'Clear YouTube reference' : hasLibraryPlayback ? 'Clear library reference' : 'Unload Best Take'}
      >
        <X className="h-3 w-3" />
      </Pressable>
    )
  }

  const renderSplitViewToggle = () => {
    if (!onToggleSplitView) return null

    const splitStyle = hasReference
      ? { bottom: cornerInset + pipControlsClearance, right: cornerInset }
      : { top: cornerInset, right: cornerInset }

    return (
      <Pressable
        type="button"
        intensity="icon"
        squish={false}
        haptic="light"
        {...(splitViewActive
          ? { 'data-tutorial': 'best-take-collapse' }
          : { 'data-tutorial': 'best-take-expand' })}
        onPointerDown={stopEventBubble}
        onTouchStart={stopEventBubble}
        onTouchEnd={stopEventBubble}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSplitView()
        }}
        className={`${CHROME_BADGE_BTN} pip-chrome-btn pip-chrome-btn--expand`}
        style={splitStyle}
        aria-label={splitViewActive ? 'Return to normal view' : 'Open split view layout'}
      >
        {splitViewActive ? (
          <Minimize2 className="h-3 w-3 stroke-[2]" aria-hidden />
        ) : (
          <Maximize2 className="h-3 w-3 stroke-[2]" aria-hidden />
        )}
      </Pressable>
    )
  }

  return (
    <div className={shellClass} data-tutorial="best-take-box">
      {onUpload && (
        <input
          type="file"
          accept="video/*, audio/*, audio/mpeg, audio/mp4, .mp3, .m4a, .wav"
          id="benchmark-upload"
          onChange={handleFileChange}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />
      )}

      <div className={isFill ? 'relative h-full w-full' : 'ui-orient-spin relative h-full w-full'}>
        <div className={innerClass}>
          <span
            className={`pointer-events-none absolute z-10 max-w-[calc(100%-3rem)] truncate whitespace-nowrap rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider bg-amber-400/90 text-white ${
              isFill ? 'px-2 py-0.5 text-[10px]' : ''
            }`}
            style={{ top: isFill ? 8 : 4, left: isFill ? 8 : pillLeft }}
          >
            Best Take
          </span>

          {hasYoutube ? (
            <>
              <div
                ref={handleYoutubeHostRef}
                className={`youtube-embed-host absolute inset-0 z-[1] overflow-hidden ${
                  isFill
                    ? 'pointer-events-auto'
                    : `youtube-embed-host--pip-guard ${
                        isYoutubePlaying
                          ? 'youtube-embed-host--pip-active'
                          : 'youtube-embed-host--pip-dormant'
                      }`
                }`}
                aria-hidden={showYoutubePipOverlay && !isYoutubePlaying}
                aria-label="YouTube reference"
              />
              {showYoutubePipOverlay && (
                <>
                  {!isYoutubePlaying && (
                    <div className="absolute inset-0 z-[2]">
                      <PipMediaPoster posterUrl={youtubePosterUrl} />
                    </div>
                  )}
                  <button
                    type="button"
                    onPointerDown={handleYoutubePipPointerDown}
                    className={`youtube-pip-interaction-layer absolute inset-0 z-[30] flex cursor-pointer items-center justify-center border-0 p-0 ${
                      isYoutubePlaying ? 'bg-transparent' : 'bg-black/35'
                    }`}
                    aria-label={
                      isYoutubePlaying ? 'Pause YouTube reference' : 'Play YouTube reference'
                    }
                  >
                    <span className={pipTouchIconClass}>
                      {isYoutubePlaying ? (
                        <Pause className="h-3 w-3 fill-white" />
                      ) : (
                        <Play className="h-3 w-3 fill-white" />
                      )}
                    </span>
                  </button>
                </>
              )}
            </>
          ) : hasTake ? (
            <div ref={playbackStageRef} className={nativePlaybackStageClass}>
              {!useNativeTakePlayback && (
                <TakeVideoPlayer
                  filePath={playbackFilePath}
                  videoUrl={src ?? ''}
                  mimeType={playbackMimeType}
                  videoRef={videoRef}
                  videoSourceKey={videoSourceKey}
                  className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                  loadingClassName={`absolute inset-0 h-full w-full ${isAudioMedia ? 'take-audio-surface' : 'bg-black'}`}
                  mirror={mirrorPlayback}
                  recordingOrientation={take?.recordingOrientation}
                  fit={playbackFit}
                  manualPlayOnly
                  audible={playbackAudible}
                />
              )}
              {!isPlaying && (
                <PipMediaPoster posterUrl={posterUrl} isAudio={isAudioMedia} />
              )}

              {onExpand && (
                dragSourceProps ? (
                  <div
                    role="button"
                    tabIndex={0}
                    className="pip-drag-layer absolute inset-0 z-[1] cursor-grab touch-none select-none border-0 bg-transparent p-0 active:cursor-grabbing"
                    aria-label="Hold then drag Best Take to Current Take, or tap to open full screen"
                    {...dragSourceProps}
                  />
                ) : (
                  <Pressable
                    type="button"
                    intensity="soft"
                    squish={false}
                    haptic="light"
                    className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0"
                    onClick={onExpand}
                    aria-label="Open Best Take in full screen"
                  />
                )
              )}

              <div className="absolute inset-0 z-[5] pointer-events-none">
                {!suspendPlayback && (
                  <Pressable
                    type="button"
                    intensity="icon"
                    squish={false}
                    haptic="light"
                    onPointerDown={stopEventBubble}
                    onTouchStart={stopEventBubble}
                    onTouchEnd={stopEventBubble}
                    onClick={handlePlayPauseClick}
                    className={`${pipTouchTargetClass} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`}
                    aria-label={isPlaying ? 'Pause inline preview' : 'Play inline preview'}
                  >
                    <span className={pipTouchIconClass}>
                      {isPlaying ? (
                        <Pause className="h-3 w-3 fill-white" />
                      ) : (
                        <Play className="h-3 w-3 fill-white" />
                      )}
                    </span>
                  </Pressable>
                )}
              </div>

              {!suspendPlayback && (
                <div
                  className={`absolute inset-x-0 bottom-0 z-20 translate-y-full px-2 py-1 transition-transform duration-200 group-hover:translate-y-0 ${
                    isAudioMedia ? 'take-audio-controls-bar' : 'bg-black/70'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                  {...touchBubbleBlockProps()}
                >
                  <MiniPipControls
                    isPlaying={isPlaying}
                    volume={volume}
                    onPlayPauseClick={handlePlayPauseClick}
                    onVolumeChange={handleVolume}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className={`pip-empty-state absolute inset-0 flex flex-col ${isFill ? 'pip-empty-state--split' : ''}`}>
              <div
                className={`pip-empty-state__body flex min-h-0 flex-col items-center justify-center gap-2 px-3 pb-2 ${
                  isFill ? 'flex-none pt-2' : 'flex-1 pt-7'
                }`}
              >
                <p className={`text-center leading-snug ${isFill ? 'text-xs' : 'text-[8px]'}`}>
                  Drag Current Take here or upload.
                </p>
              </div>
              <div className="pip-empty-state__actions flex shrink-0">
                {onUpload && (
                  <label
                    htmlFor="benchmark-upload"
                    data-tutorial="best-take-youtube"
                    className={`${emptyActionClass} pip-empty-action--upload`}
                  >
                    <Upload className="h-3 w-3" />
                    Upload
                  </label>
                )}
                <Pressable
                  type="button"
                  intensity="soft"
                  haptic="light"
                  data-tutorial="best-take-youtube"
                  onPointerDown={stopEventBubble}
                  onTouchStart={stopEventBubble}
                  onTouchEnd={stopEventBubble}
                  onClick={(e) => {
                    e.stopPropagation()
                    notifyTutorial?.('media-touched')
                    setYoutubeDialogOpen(true)
                  }}
                  className={`${emptyActionClass} pip-empty-action--youtube`}
                  aria-label="Load YouTube reference"
                >
                  <Youtube className="h-3 w-3" aria-hidden />
                  YouTube
                </Pressable>
              </div>
            </div>
          )}

          {renderClearButton()}
          {renderSplitViewToggle()}

          {showUploadBadge && (
            <label
              htmlFor="benchmark-upload"
              data-tutorial="best-take-youtube"
              onPointerDown={stopEventBubble}
              onTouchStart={stopEventBubble}
              onTouchEnd={stopEventBubble}
              onClick={stopEventBubble}
              className={`${CHROME_BADGE_BTN} pip-chrome-btn pip-chrome-btn--upload`}
              style={{ top: cornerInset, left: cornerInset }}
              aria-label="Upload best take media"
            >
              <Upload className="h-3 w-3" />
            </label>
          )}
        </div>
      </div>

      <YoutubeUrlDialog
        open={youtubeDialogOpen}
        onClose={() => setYoutubeDialogOpen(false)}
        onSubmit={onSubmitYoutube}
      />
    </div>
  )
}

export default memo(BestTakeBox)

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
  releaseTakePlaybackAudio,
} from '../utils/takePlaybackAudio'
import {
  maintainYoutubeProxyLoudness,
  pauseYoutubeProxy,
} from '../utils/playalong/youtubeBridge'
import { toggleInlineTakePlayback } from '../utils/takeInlinePlayback'
import { updateTakePlaybackSpeakerGain } from '../utils/takePlaybackSpeaker'
import { useTutorialAction } from '../context/TutorialContext'
import type { Take } from '../types'
import type { LibraryPlaybackReference } from '../types/library'
import { usePipInlineDecoder } from '../hooks/usePipInlineDecoder'
import { HUD_GLASS_FLOAT_BADGE, HUD_GLASS_PIP_PLAY_ICON } from '../utils/interactiveUx'
import { AUDIO_TAKE_THUMBNAIL } from '../utils/mediaType'
import { isAudioMimeType } from '../utils/mobileVideo'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { waitForMediaReadyWithRetry } from '../utils/mediaPlayback'

const CHROME_BADGE_BTN = `${HUD_GLASS_FLOAT_BADGE} hud-glass-badge--ghost`

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
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false)
  const notifyTutorial = useTutorialAction()

  const hasLibraryPlayback = Boolean(librarySrc || libraryPlayback?.filePath)
  const hasTake = Boolean(hasLibraryPlayback || take?.videoUrl || take?.filePath)
  const hasYoutube = Boolean(youtubeEmbedUrl)
  const hasReference = hasTake || hasYoutube
  const isFill = layout === 'fill'

  const showUploadBadge = Boolean(onUpload) && hasTake && !hasLibraryPlayback

  useEffect(() => {
    if (youtubeDialogOpen) {
      notifyTutorial?.('youtube-opened')
    }
  }, [notifyTutorial, youtubeDialogOpen])

  useEffect(() => {
    setIsPlaying(false)
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
  }, [hasYoutube, suspendPlayback, youtubeEmbedUrl, youtubeIframeRef])

  useEffect(() => {
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
  }, [hasTake, videoRef, videoSourceKey])

  useEffect(() => {
    onPlaybackChange?.(isPlaying)
  }, [isPlaying, onPlaybackChange])

  useEffect(() => {
    if (!suspendPlayback || !hasTake) return
    const media = videoRef.current
    if (!media) return
    media.pause()
    setIsPlaying(false)
  }, [hasTake, suspendPlayback, videoRef, videoSourceKey])

  const posterUrl =
    take?.thumbnailUrl ??
    (hasLibraryPlayback || take?.mediaType === 'audio' ? AUDIO_TAKE_THUMBNAIL : null)
  const { decoderActive, pendingPlayRef, requestDecoderForPlay } = usePipInlineDecoder({
    suspendPlayback,
    isAutoPlayArmed: false,
    isPlaying,
    videoSourceKey,
    mediaRef: videoRef,
  })

  const handlePlayPauseClick = useCallback(
    (event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      stopEventBubble(event)
      if (suspendPlayback || !hasTake) return

      if (!decoderActive) {
        requestDecoderForPlay()
        return
      }

      const video = videoRef.current
      if (!video) return

      if (video.paused) {
        setIsPlaying(true)
        toggleInlineTakePlayback(video, {
          onPlaying: () => setIsPlaying(true),
          onFailure: () => {
            setIsPlaying(false)
            void releaseTakePlaybackAudio()
          },
          onPaused: () => setIsPlaying(false),
        })
      } else {
        toggleInlineTakePlayback(video, {
          onPaused: () => {
            setIsPlaying(false)
            void releaseTakePlaybackAudio()
          },
        })
      }
    },
    [decoderActive, hasTake, requestDecoderForPlay, suspendPlayback, videoRef],
  )

  useEffect(() => {
    if (!decoderActive || !pendingPlayRef.current || suspendPlayback || !hasTake) return

    let cancelled = false
    void (async () => {
      const media = videoRef.current
      if (!media) return

      const ready = await waitForMediaReadyWithRetry(media)
      if (cancelled || !pendingPlayRef.current) return
      pendingPlayRef.current = false
      if (!ready) return

      setIsPlaying(true)
      toggleInlineTakePlayback(media, {
        onPlaying: () => setIsPlaying(true),
        onFailure: () => {
          setIsPlaying(false)
          void releaseTakePlaybackAudio()
        },
        onPaused: () => setIsPlaying(false),
      })
    })()

    return () => {
      cancelled = true
    }
  }, [decoderActive, hasTake, pendingPlayRef, suspendPlayback, videoRef, videoSourceKey])

  const handleVolume = useCallback(
    (value: number) => {
      setVolume(value)
      const video = videoRef.current
      if (!video) return
      video.volume = value
      updateTakePlaybackSpeakerGain(video, value, false)
    },
    [videoRef],
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

  const playbackAudible = isPlaying && !suspendPlayback && hasTake

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
            <div
              ref={onYoutubeHostChange}
              className="youtube-embed-host pointer-events-auto absolute inset-0 z-[1] overflow-hidden"
              aria-label="YouTube reference"
            />
          ) : hasTake ? (
            <>
              {decoderActive ? (
                <TakeVideoPlayer
                  filePath={playbackFilePath}
                  videoUrl={src ?? ''}
                  mimeType={playbackMimeType}
                  videoRef={videoRef}
                  videoSourceKey={videoSourceKey}
                  className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                  loadingClassName={`absolute inset-0 h-full w-full ${isAudioMedia ? 'take-audio-surface' : 'bg-black'}`}
                  mirror={hasLibraryPlayback ? false : take!.mirrorPlayback !== false}
                  recordingOrientation={take?.recordingOrientation}
                  fit={playbackFit}
                  manualPlayOnly
                  audible={playbackAudible}
                />
              ) : (
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
            </>
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

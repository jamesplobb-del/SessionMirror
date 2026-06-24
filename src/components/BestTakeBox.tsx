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
} from 'react'
import { Maximize2, Play, Pause, Upload, X, Youtube } from 'lucide-react'
import TakeVideoPlayer from './TakeVideoPlayer'
import MiniPipControls from './MiniPipControls'
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
import type { Take } from '../types'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'

const UPLOAD_BADGE_BTN =
  'pointer-events-auto absolute z-30 flex h-7 w-7 items-center justify-center rounded-full border-[0.5px] border-white/10 bg-black/40 text-white shadow-[0_1px_6px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition hover:bg-black/60'

const emptyActionClass =
  'pointer-events-auto flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[9px] font-medium text-white/75 transition hover:bg-white/10'

export interface BestTakeBoxProps {
  layout: 'pip' | 'fill'
  take: Take | null
  youtubeEmbedUrl: string | null
  suspendPlayback?: boolean
  videoRef?: RefObject<HTMLMediaElement | null>
  dropHighlight?: boolean
  onUnpinTake: () => void
  onClearYoutube: () => void
  onSubmitYoutube: (embedUrl: string) => void
  onUpload?: (file: File) => void
  onToggleSplitView?: () => void
  splitViewActive?: boolean
  onExpand?: () => void
  onPlaybackChange?: (playing: boolean) => void
  onYoutubeHostChange?: (el: HTMLDivElement | null) => void
  youtubeIframeRef?: RefObject<HTMLIFrameElement | null>
}

function BestTakeBox({
  layout,
  take,
  youtubeEmbedUrl,
  suspendPlayback = false,
  videoRef: externalVideoRef,
  dropHighlight = false,
  onUnpinTake,
  onClearYoutube,
  onSubmitYoutube,
  onUpload,
  onToggleSplitView,
  splitViewActive = false,
  onExpand,
  onPlaybackChange,
  onYoutubeHostChange,
  youtubeIframeRef,
}: BestTakeBoxProps) {
  const src = take?.videoUrl ?? null
  const videoSourceKey = src || take?.filePath || youtubeEmbedUrl || 'empty'
  const internalVideoRef = useRef<HTMLMediaElement>(null)
  const videoRef = externalVideoRef ?? internalVideoRef
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false)

  const hasTake = Boolean(src || take?.filePath)
  const hasYoutube = Boolean(youtubeEmbedUrl)
  const hasReference = hasTake || hasYoutube
  const isFill = layout === 'fill'

  const showUploadBadge = Boolean(onUpload) && hasTake

  useEffect(() => {
    setIsPlaying(false)
  }, [videoSourceKey, suspendPlayback])

  useEffect(() => {
    if (!hasYoutube || !youtubeIframeRef?.current) return

    maintainYoutubeProxyLoudness(youtubeIframeRef.current, 1)
    const interval = window.setInterval(() => {
      maintainYoutubeProxyLoudness(youtubeIframeRef.current, 1)
    }, 150)

    return () => window.clearInterval(interval)
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

  const handlePlayPauseClick = useCallback(
    (event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      stopEventBubble(event)
      if (suspendPlayback || !hasTake) return
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
    [hasTake, suspendPlayback, videoRef],
  )

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
      if (file) onUpload?.(file)
    },
    [onUpload],
  )

  const handleClearReference = useCallback(() => {
    if (hasYoutube) onClearYoutube()
    else onUnpinTake()
  }, [hasYoutube, onClearYoutube, onUnpinTake])

  const pipTouchTargetClass =
    'pointer-events-auto z-[5] flex min-h-11 min-w-11 items-center justify-center p-3'
  const pipTouchIconClass =
    'flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition hover:bg-black/70'

  const playbackFit =
    isFill && take?.recordingOrientation === 'landscape' ? 'contain' : 'cover'

  const playbackAudible = isPlaying && !suspendPlayback && hasTake

  const shellClass = isFill
    ? 'relative h-full w-full min-h-0 overflow-hidden'
    : 'pip-video-container group relative aspect-video'

  const innerClass = isFill
    ? `group relative z-0 h-full w-full overflow-hidden bg-black/95 ring-1 ring-amber-400/50 ${
        hasReference ? 'opacity-100' : 'opacity-90'
      }`
    : `group relative z-0 h-full w-full overflow-hidden rounded-xl border-[0.5px] bg-black/95 shadow-lg shadow-black/50 ring-1 ring-amber-400/50 transition-[opacity,box-shadow,transform,border-color] duration-200 ease-in ${
        hasReference ? 'opacity-100' : 'opacity-90'
      } ${dropHighlight ? 'pip-drop-target--active border-amber-400/80' : 'border-white/10'}`

  const pillLeft = showUploadBadge ? 36 : 8

  const chromeInset = isFill ? 8 : 4

  const renderClearButton = () => {
    if (!hasReference) return null

    return (
      <button
        type="button"
        onPointerDown={stopEventBubble}
        onTouchStart={stopEventBubble}
        onTouchEnd={stopEventBubble}
        onClick={(e) => {
          e.stopPropagation()
          handleClearReference()
        }}
        className={UPLOAD_BADGE_BTN}
        style={{ top: chromeInset, right: chromeInset }}
        aria-label={hasYoutube ? 'Clear YouTube reference' : 'Unload Best Take'}
      >
        <X className="h-3 w-3" />
      </button>
    )
  }

  const renderExpandButton = () => {
    if (!onToggleSplitView || splitViewActive) return null

    const expandPosition = hasReference
      ? { bottom: chromeInset, right: chromeInset }
      : { top: chromeInset, right: chromeInset }

    return (
      <button
        type="button"
        onPointerDown={stopEventBubble}
        onTouchStart={stopEventBubble}
        onTouchEnd={stopEventBubble}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSplitView()
        }}
        className={UPLOAD_BADGE_BTN}
        style={expandPosition}
        aria-label="Open split view layout"
      >
        <Maximize2 className="h-3 w-3 stroke-[2]" aria-hidden />
      </button>
    )
  }

  return (
    <div className={shellClass}>
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
              <TakeVideoPlayer
                filePath={take!.filePath}
                videoUrl={src ?? ''}
                mimeType={
                  take!.videoMimeType ??
                  (take!.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
                }
                videoRef={videoRef}
                videoSourceKey={videoSourceKey}
                className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                loadingClassName="absolute inset-0 h-full w-full bg-black"
                mirror={take!.mirrorPlayback !== false}
                recordingOrientation={take!.recordingOrientation}
                fit={playbackFit}
                manualPlayOnly
                audible={playbackAudible}
              />

              {onExpand && (
                <button
                  type="button"
                  className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0"
                  onClick={onExpand}
                  aria-label="Open Best Take in full screen"
                />
              )}

              <div className="absolute inset-0 z-[5] pointer-events-none">
                {!suspendPlayback && (
                  <button
                    type="button"
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
                  </button>
                )}
              </div>

              {!suspendPlayback && (
                <div
                  className="absolute inset-x-0 bottom-0 z-20 translate-y-full bg-black/60 px-2 py-1 backdrop-blur-md transition-transform duration-200 group-hover:translate-y-0"
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
            <div className="absolute inset-0 flex flex-col bg-black/95">
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 pb-2 pt-7">
                <p className={`text-center leading-snug text-white/50 ${isFill ? 'text-xs' : 'text-[8px]'}`}>
                  Drag Current Take here or upload.
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5 border-t border-white/10 bg-black/20 p-1.5">
                {onUpload && (
                  <label htmlFor="benchmark-upload" className={emptyActionClass}>
                    <Upload className="h-3 w-3" />
                    Upload
                  </label>
                )}
                <button
                  type="button"
                  onPointerDown={stopEventBubble}
                  onTouchStart={stopEventBubble}
                  onTouchEnd={stopEventBubble}
                  onClick={(e) => {
                    e.stopPropagation()
                    setYoutubeDialogOpen(true)
                  }}
                  className={emptyActionClass}
                  aria-label="Load YouTube reference"
                >
                  <Youtube className="h-3 w-3 text-red-500" />
                  YouTube
                </button>
              </div>
            </div>
          )}

          {renderClearButton()}
          {renderExpandButton()}

          {showUploadBadge && (
            <label
              htmlFor="benchmark-upload"
              onPointerDown={stopEventBubble}
              onTouchStart={stopEventBubble}
              onTouchEnd={stopEventBubble}
              onClick={stopEventBubble}
              className={UPLOAD_BADGE_BTN}
              style={{ top: chromeInset, left: chromeInset }}
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

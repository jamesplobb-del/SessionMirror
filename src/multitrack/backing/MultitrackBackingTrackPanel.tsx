import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import { FileAudio, Link, Pause, Play, Trash2, Upload, X, Youtube } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import { normalizeYoutubeEmbedUrl, parseYoutubeEmbedUrl } from '../../utils/youtubeEmbed'
import {
  registerYoutubeIframe,
  setYoutubeProxyVolumeFromUi,
  wakeYoutubeReference,
} from '../../utils/playalong/youtubeBridge'
import type { MultitrackBackingTrack } from '../types'

const BACKING_AUDIO_ACCEPT = 'audio/*,audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav,.aac'

/**
 * Always-mounted home for the backing <audio>/<iframe> elements so playback
 * survives the settings sheet closing (the panel UI is on-demand, the sound
 * is not). Render exactly one of these per multitrack overlay.
 */
export function MultitrackBackingMediaHost({
  backing,
  audioRef,
  youtubeIframeRef,
}: {
  backing: MultitrackBackingTrack
  audioRef: RefObject<HTMLAudioElement | null>
  youtubeIframeRef: RefObject<HTMLIFrameElement | null>
}) {
  return (
    <div className="multitrack-backing-media-host" aria-hidden>
      <audio ref={audioRef} className="hidden" preload="metadata" />
      {backing.kind === 'youtube' ? (
        <div className="multitrack-backing-strip__youtube-host">
          <iframe
            key={normalizeYoutubeEmbedUrl(backing.embedUrl)}
            ref={youtubeIframeRef}
            src={normalizeYoutubeEmbedUrl(backing.embedUrl)}
            title="Multitrack YouTube backing"
            className="h-full w-full border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            onLoad={() => {
              const iframe = youtubeIframeRef.current
              registerYoutubeIframe(iframe)
              wakeYoutubeReference(iframe, { attemptPlay: false, uiVolume: backing.volume })
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

export default function MultitrackBackingTrackPanel({
  backing,
  audioRef,
  youtubeIframeRef,
  isPlaying,
  placement = 'setup',
  onBackingChange,
  onTogglePlayback,
  onDismiss,
  renderMedia = true,
}: {
  backing: MultitrackBackingTrack
  audioRef: RefObject<HTMLAudioElement | null>
  youtubeIframeRef: RefObject<HTMLIFrameElement | null>
  isPlaying: boolean
  placement?: 'setup' | 'stage'
  onBackingChange: (backing: MultitrackBackingTrack) => void
  onTogglePlayback: () => void
  onDismiss?: () => void
  /**
   * When the panel lives in an on-demand sheet, the host must own the actual
   * <audio>/<iframe> elements (see MultitrackBackingMediaHost) so playback
   * survives the sheet closing — pass false to skip rendering them here.
   */
  renderMedia?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ pointerId: number; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null)
  const uploadedAudioUrlRef = useRef<string | null>(null)
  const [youtubeInputOpen, setYoutubeInputOpen] = useState(false)
  const [youtubeValue, setYoutubeValue] = useState('')
  const [youtubeError, setYoutubeError] = useState<string | null>(null)
  const [stageOffset, setStageOffset] = useState({ x: 0, y: 0 })
  const volume = backing.volume
  const hasBacking = backing.kind !== 'none'

  useEffect(() => {
    if (backing.kind !== 'youtube') return
    setYoutubeProxyVolumeFromUi(youtubeIframeRef.current, backing.volume)
  }, [backing, youtubeIframeRef])

  // Revoke the uploaded MP3's blob URL once it's no longer the active backing
  // track (cleared, replaced, or the panel unmounts) to avoid leaking memory.
  useEffect(() => {
    if (backing.kind === 'audio' && backing.src === uploadedAudioUrlRef.current) return
    if (uploadedAudioUrlRef.current) {
      URL.revokeObjectURL(uploadedAudioUrlRef.current)
      uploadedAudioUrlRef.current = null
    }
  }, [backing])

  useEffect(() => {
    return () => {
      if (uploadedAudioUrlRef.current) {
        URL.revokeObjectURL(uploadedAudioUrlRef.current)
        uploadedAudioUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (backing.kind !== 'audio') {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      return
    }

    audio.src = backing.src
    audio.preload = 'auto'
    audio.load()
  }, [audioRef, backing.kind, backing.kind === 'audio' ? backing.src : null])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || backing.kind !== 'audio') return
    audio.volume = backing.volume
  }, [audioRef, backing])

  const loadYoutube = () => {
    const embedUrl = parseYoutubeEmbedUrl(youtubeValue)
    if (!embedUrl) {
      setYoutubeError('Paste a valid YouTube link.')
      return
    }
    onBackingChange({ kind: 'youtube', embedUrl, label: 'YouTube', volume })
    setYoutubeInputOpen(false)
    setYoutubeValue('')
    setYoutubeError(null)
  }

  const changeVolume = (nextVolume: number) => {
    const clamped = Math.min(1, Math.max(0, nextVolume))
    if (backing.kind === 'none') {
      onBackingChange({ ...backing, volume: clamped })
      return
    }
    onBackingChange({ ...backing, volume: clamped })
  }

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (placement !== 'stage') return
    const target = event.target as HTMLElement
    if (target.closest('button,input,label')) return
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: stageOffset.x,
      startY: stageOffset.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const nextX = drag.startX + event.clientX - drag.startClientX
    const nextY = drag.startY + event.clientY - drag.startClientY
    const rect = event.currentTarget.getBoundingClientRect()
    const maxX = Math.max(24, (window.innerWidth - rect.width) / 2)
    const minY = -Math.max(0, rect.top - 8)
    const maxY = Math.max(24, window.innerHeight - rect.bottom - 8)
    setStageOffset({
      x: Math.min(maxX, Math.max(-maxX, nextX)),
      y: Math.min(maxY, Math.max(minY, nextY)),
    })
  }

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  const stageStyle = placement === 'stage'
    ? ({
        '--backing-stage-x': `${stageOffset.x}px`,
        '--backing-stage-y': `${stageOffset.y}px`,
      } as CSSProperties)
    : undefined

  return (
    <section
      className={`multitrack-backing-strip multitrack-backing-strip--${placement}`}
      style={stageStyle}
      aria-label="Backing track"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {placement === 'stage' && onDismiss ? (
        <Pressable
          type="button"
          intensity="icon"
          className="multitrack-backing-strip__dismiss"
          aria-label="Hide backing track panel"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Pressable>
      ) : null}
      {renderMedia ? (
        <>
          <audio ref={audioRef} className="hidden" preload="metadata" />
          {backing.kind === 'youtube' ? (
            <div className="multitrack-backing-strip__youtube-host" aria-hidden>
              <iframe
                key={normalizeYoutubeEmbedUrl(backing.embedUrl)}
                ref={youtubeIframeRef}
                src={normalizeYoutubeEmbedUrl(backing.embedUrl)}
                title="Multitrack YouTube backing"
                className="h-full w-full border-0"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                onLoad={() => {
                  const iframe = youtubeIframeRef.current
                  registerYoutubeIframe(iframe)
                  wakeYoutubeReference(iframe, { attemptPlay: false, uiVolume: backing.volume })
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept={BACKING_AUDIO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          if (uploadedAudioUrlRef.current) {
            URL.revokeObjectURL(uploadedAudioUrlRef.current)
          }
          const src = URL.createObjectURL(file)
          uploadedAudioUrlRef.current = src
          onBackingChange({
            kind: 'audio',
            src,
            fileName: file.name,
            mimeType: file.type || 'audio/mpeg',
            volume,
          })
          event.currentTarget.value = ''
        }}
      />

      <div className="multitrack-backing-strip__main">
        <div className="multitrack-backing-strip__identity">
          {backing.kind === 'youtube' ? <Youtube className="h-4 w-4 text-red-500" /> : <FileAudio className="h-4 w-4" />}
          <div>
            <p>{backing.kind === 'none' ? 'Backing track' : backing.kind === 'audio' ? backing.fileName : backing.label}</p>
            <span>{backing.kind === 'none' ? 'Add MP3 or YouTube for recording' : 'Starts after count-in while recording'}</span>
          </div>
        </div>
        <Pressable type="button" intensity="icon" onClick={onTogglePlayback} disabled={!hasBacking} className="multitrack-backing-strip__play" aria-label={isPlaying ? 'Pause backing track' : 'Play backing track'}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Pressable>
      </div>

      <div className="multitrack-backing-strip__controls">
        <Pressable type="button" intensity="soft" onClick={() => fileInputRef.current?.click()} className="multitrack-backing-strip__chip">
          <Upload className="h-3.5 w-3.5" />
          MP3
        </Pressable>
        <Pressable type="button" intensity="soft" onClick={() => setYoutubeInputOpen((open) => !open)} className="multitrack-backing-strip__chip">
          <Youtube className="h-3.5 w-3.5" />
          YouTube
        </Pressable>
        <label className="multitrack-backing-strip__volume">
          <span>Vol</span>
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => changeVolume(Number(event.target.value))} />
        </label>
        {hasBacking ? (
          <Pressable type="button" intensity="icon" onClick={() => onBackingChange({ kind: 'none', volume })} className="multitrack-backing-strip__clear" aria-label="Clear backing track">
            <Trash2 className="h-3.5 w-3.5" />
          </Pressable>
        ) : null}
      </div>

      {youtubeInputOpen ? (
        <div className="multitrack-backing-strip__youtube-row">
          <Link className="h-4 w-4 text-stone-400" />
          <input
            type="url"
            inputMode="url"
            placeholder="Paste YouTube link"
            value={youtubeValue}
            onChange={(event) => {
              setYoutubeValue(event.target.value)
              setYoutubeError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') loadYoutube()
              if (event.key === 'Escape') setYoutubeInputOpen(false)
            }}
          />
          <Pressable type="button" intensity="soft" onClick={loadYoutube}>Load</Pressable>
          {youtubeError ? <span>{youtubeError}</span> : null}
        </div>
      ) : null}
    </section>
  )
}

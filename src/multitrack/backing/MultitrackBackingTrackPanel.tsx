import { useEffect, useRef, useState, type RefObject } from 'react'
import { FileAudio, Link, Pause, Play, Trash2, Upload, Youtube } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import { normalizeYoutubeEmbedUrl, parseYoutubeEmbedUrl } from '../../utils/youtubeEmbed'
import {
  registerYoutubeIframe,
  setYoutubeProxyVolumeFromUi,
  wakeYoutubeReference,
} from '../../utils/playalong/youtubeBridge'
import type { MultitrackBackingTrack } from '../types'

const BACKING_AUDIO_ACCEPT = 'audio/*,audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav,.aac'

export default function MultitrackBackingTrackPanel({
  backing,
  audioRef,
  youtubeIframeRef,
  isPlaying,
  placement = 'setup',
  onBackingChange,
  onTogglePlayback,
}: {
  backing: MultitrackBackingTrack
  audioRef: RefObject<HTMLAudioElement | null>
  youtubeIframeRef: RefObject<HTMLIFrameElement | null>
  isPlaying: boolean
  placement?: 'setup' | 'stage'
  onBackingChange: (backing: MultitrackBackingTrack) => void
  onTogglePlayback: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [youtubeInputOpen, setYoutubeInputOpen] = useState(false)
  const [youtubeValue, setYoutubeValue] = useState('')
  const [youtubeError, setYoutubeError] = useState<string | null>(null)
  const volume = backing.volume
  const hasBacking = backing.kind !== 'none'

  useEffect(() => {
    if (backing.kind !== 'youtube') return
    setYoutubeProxyVolumeFromUi(youtubeIframeRef.current, backing.volume)
  }, [backing, youtubeIframeRef])

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

  return (
    <section className={`multitrack-backing-strip multitrack-backing-strip--${placement}`} aria-label="Backing track">
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
      <input
        ref={fileInputRef}
        type="file"
        accept={BACKING_AUDIO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          onBackingChange({
            kind: 'audio',
            src: URL.createObjectURL(file),
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

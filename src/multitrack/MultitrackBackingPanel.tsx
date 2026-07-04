import { useRef, useState, type ChangeEvent } from 'react'
import { Pause, Play, RotateCcw, Upload } from 'lucide-react'
import { formatTime } from '../hooks/useVideoPlayback'
import type { MultitrackBackingTrack } from './types'
import Pressable from '../components/ui/Pressable'

interface MultitrackBackingPanelProps {
  backing: MultitrackBackingTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  onImportMp3: (file: File) => void
  onSetYoutube: (url: string) => void
  onPlay: () => void
  onPause: () => void
  onRestart: () => void
}

export default function MultitrackBackingPanel({
  backing,
  isPlaying,
  currentTime,
  duration,
  onImportMp3,
  onSetYoutube,
  onPlay,
  onPause,
  onRestart,
}: MultitrackBackingPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [youtubeInput, setYoutubeInput] = useState('')

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onImportMp3(file)
    event.target.value = ''
  }

  return (
    <section className="multitrack-backing">
      <h3 className="multitrack-backing__title">Master timeline</h3>
      <p className="multitrack-backing__lead">
        MP3 import or YouTube play-along drives sync for every performance box.
      </p>

      <div className="multitrack-backing__import-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,.mp3"
          className="sr-only"
          onChange={handleFileChange}
        />
        <Pressable
          type="button"
          intensity="soft"
          className="multitrack-backing__import-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} />
          Import MP3
        </Pressable>
      </div>

      <div className="multitrack-backing__youtube-row">
        <input
          type="text"
          value={youtubeInput}
          onChange={(event) => setYoutubeInput(event.target.value)}
          placeholder="YouTube URL or video ID"
          className="multitrack-backing__youtube-input"
        />
        <Pressable
          type="button"
          intensity="soft"
          onClick={() => {
            if (youtubeInput.trim()) onSetYoutube(youtubeInput.trim())
          }}
        >
          Use YouTube
        </Pressable>
      </div>

      {backing ? (
        <div className="multitrack-backing__active">
          <p className="multitrack-backing__name">{backing.name}</p>
          <p className="multitrack-backing__time">
            {formatTime(currentTime)}
            {duration > 0 ? ` / ${formatTime(duration)}` : ''}
          </p>
          <div className="multitrack-backing__transport">
            <Pressable type="button" intensity="soft" onClick={onRestart} aria-label="Restart">
              <RotateCcw size={18} />
            </Pressable>
            <Pressable
              type="button"
              intensity="normal"
              className="multitrack-backing__play-btn"
              onClick={isPlaying ? onPause : onPlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </Pressable>
          </div>
        </div>
      ) : (
        <p className="multitrack-backing__empty">No backing track yet.</p>
      )}
    </section>
  )
}

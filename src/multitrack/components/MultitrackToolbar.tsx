import { Pause, Play, RotateCcw, Share2, SlidersHorizontal } from 'lucide-react'
import { formatTime } from '../../hooks/useVideoPlayback'
import Pressable from '../../components/ui/Pressable'
import type { MultitrackPracticeSettings } from '../types'

export default function MultitrackToolbar(props: {
  isPlaying: boolean; currentTime: number; duration: number; practice: MultitrackPracticeSettings; showLayoutPicker: boolean
  onTogglePlay: () => void; onRestart: () => void; onSeek: (t: number) => void; onToggleLayoutPicker: () => void
  onToggleMetronome: () => void; onTogglePitch: () => void; onTogglePracticeOverlay: () => void; onExport: () => void
}) {
  const { isPlaying, currentTime, duration, practice, showLayoutPicker, onTogglePlay, onRestart, onSeek, onToggleLayoutPicker, onToggleMetronome, onTogglePitch, onTogglePracticeOverlay, onExport } = props
  return (
    <footer className="multitrack-toolbar">
      <div className="multitrack-toolbar__transport">
        <Pressable type="button" intensity="soft" onClick={onRestart} className="multitrack-toolbar__btn"><RotateCcw className="h-5 w-5" /></Pressable>
        <Pressable type="button" intensity="soft" onClick={onTogglePlay} className="multitrack-toolbar__btn multitrack-toolbar__btn--primary">{isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}</Pressable>
        <span className="multitrack-toolbar__time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
      <input type="range" min={0} max={duration || 1} step={0.05} value={currentTime} onChange={(e) => onSeek(Number(e.target.value))} className="multitrack-toolbar__scrub" />
      <div className="multitrack-toolbar__actions">
        <Pressable type="button" intensity="soft" onClick={onToggleLayoutPicker} className={`multitrack-toolbar__chip ${showLayoutPicker ? 'multitrack-toolbar__chip--active' : ''}`}><SlidersHorizontal className="h-4 w-4" />Layout</Pressable>
        <Pressable type="button" intensity="soft" onClick={onToggleMetronome} className={`multitrack-toolbar__chip ${practice.showMetronome ? 'multitrack-toolbar__chip--active' : ''}`}>Metro</Pressable>
        <Pressable type="button" intensity="soft" onClick={onTogglePitch} className={`multitrack-toolbar__chip ${practice.showPitch ? 'multitrack-toolbar__chip--active' : ''}`}>Pitch</Pressable>
        <Pressable type="button" intensity="soft" onClick={onTogglePracticeOverlay} className={`multitrack-toolbar__chip ${practice.practiceOverlayEnabled ? 'multitrack-toolbar__chip--active' : ''}`}>Overlay</Pressable>
        <Pressable type="button" intensity="soft" onClick={onExport} className="multitrack-toolbar__chip multitrack-toolbar__chip--export"><Share2 className="h-4 w-4" />Export</Pressable>
      </div>
    </footer>
  )
}

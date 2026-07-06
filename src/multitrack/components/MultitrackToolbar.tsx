import { Pause, Play, RotateCcw, Share2, SlidersHorizontal } from 'lucide-react'
import { formatTime } from '../../hooks/useVideoPlayback'
import Pressable from '../../components/ui/Pressable'

export default function MultitrackToolbar(props: {
  isPlaying: boolean; currentTime: number; duration: number; showLayoutPicker: boolean
  isExporting?: boolean
  onTogglePlay: () => void; onRestart: () => void; onSeek: (t: number) => void; onToggleLayoutPicker: () => void
  onExport: () => void
}) {
  const { isPlaying, currentTime, duration, showLayoutPicker, isExporting = false, onTogglePlay, onRestart, onSeek, onToggleLayoutPicker, onExport } = props
  return (
    <footer className="multitrack-toolbar">
      <div className="multitrack-toolbar__transport">
        <Pressable type="button" intensity="soft" onClick={onRestart} className="multitrack-toolbar__btn"><RotateCcw className="h-5 w-5" /></Pressable>
        <Pressable type="button" intensity="soft" onClick={onTogglePlay} className="multitrack-toolbar__btn multitrack-toolbar__btn--primary">{isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}<span>{isPlaying ? 'Pause all' : 'Play all'}</span></Pressable>
        <span className="multitrack-toolbar__time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
      <input type="range" min={0} max={duration || 1} step={0.05} value={currentTime} onChange={(e) => onSeek(Number(e.target.value))} className="multitrack-toolbar__scrub" />
      <div className="multitrack-toolbar__actions">
        <Pressable type="button" intensity="soft" onClick={onToggleLayoutPicker} className={`multitrack-toolbar__chip ${showLayoutPicker ? 'multitrack-toolbar__chip--active' : ''}`}><SlidersHorizontal className="h-4 w-4" />Layout</Pressable>
        <Pressable type="button" intensity="soft" onClick={onExport} disabled={isExporting} className="multitrack-toolbar__chip multitrack-toolbar__chip--export"><Share2 className="h-4 w-4" />{isExporting ? 'Rendering…' : 'Export'}</Pressable>
      </div>
    </footer>
  )
}

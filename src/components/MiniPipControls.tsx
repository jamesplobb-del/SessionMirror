import { stopEventBubble } from '../utils/eventBubbling'
import { Pause, Play, Volume2 } from 'lucide-react'

interface MiniPipControlsProps {
  isPlaying: boolean
  volume: number
  onTogglePlay: () => void
  onVolumeChange: (value: number) => void
}

export default function MiniPipControls({
  isPlaying,
  volume,
  onTogglePlay,
  onVolumeChange,
}: MiniPipControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onPointerDown={stopEventBubble}
        onTouchStart={stopEventBubble}
        onTouchEnd={stopEventBubble}
        onClick={(e) => {
          stopEventBubble(e)
          onTogglePlay()
        }}
        className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-white"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className="h-2.5 w-2.5" />
        ) : (
          <Play className="h-2.5 w-2.5 fill-white" />
        )}
      </button>
      <Volume2 className="h-2.5 w-2.5 text-white/60" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        className="h-1 flex-1 accent-white"
        aria-label="Volume"
      />
    </div>
  )
}

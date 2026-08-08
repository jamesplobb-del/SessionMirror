import Pressable from './ui/Pressable'
import { stopEventBubble } from '../utils/eventBubbling'
import { Pause, Play, Volume2 } from 'lucide-react'
import type { PointerEvent } from 'react'

interface MiniPipControlsProps {
  isPlaying: boolean
  volume: number
  onPlayPauseClick: (event: PointerEvent<HTMLButtonElement>) => void
  onVolumeChange: (value: number) => void
}

/**
 * Styled through CSS classes rather than fixed white-on-dark utilities: this
 * bar sits on the light elevated surface in Audio Mode and on a dark bar over
 * the live camera, so the colors have to follow the theme (see
 * .mini-pip-controls in index.css / camera-mode-glass.css).
 */
export default function MiniPipControls({
  isPlaying,
  volume,
  onPlayPauseClick,
  onVolumeChange,
}: MiniPipControlsProps) {
  return (
    <div className="mini-pip-controls flex items-center gap-1.5">
      <Pressable
        type="button"
        intensity="icon"
        haptic="light"
        onPointerDown={stopEventBubble}
        onTouchStart={stopEventBubble}
        onTouchEnd={stopEventBubble}
        onClick={onPlayPauseClick}
        className="mini-pip-controls__btn flex h-5 w-5 items-center justify-center rounded-full"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className="h-2.5 w-2.5" />
        ) : (
          <Play className="mini-pip-controls__play-glyph h-2.5 w-2.5" />
        )}
      </Pressable>
      <Volume2 className="mini-pip-controls__icon h-2.5 w-2.5" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        className="mini-pip-controls__slider h-1 flex-1"
        aria-label="Volume"
      />
    </div>
  )
}

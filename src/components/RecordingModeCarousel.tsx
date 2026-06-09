import { useCallback, useRef } from 'react'
import type { RecordingMode } from '../types'

const MODES: { id: RecordingMode; label: string }[] = [
  { id: 'video', label: 'VIDEO' },
  { id: 'audio', label: 'AUDIO' },
]

const SWIPE_THRESHOLD_PX = 36

interface RecordingModeCarouselProps {
  value: RecordingMode
  onChange: (mode: RecordingMode) => void
  disabled?: boolean
}

export default function RecordingModeCarousel({
  value,
  onChange,
  disabled = false,
}: RecordingModeCarouselProps) {
  const touchStartXRef = useRef(0)

  const handleModeClick = useCallback(
    (mode: RecordingMode) => {
      if (disabled || mode === value) return
      onChange(mode)
    },
    [disabled, onChange, value],
  )

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? 0
  }, [])

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (disabled) return

      const endX = event.changedTouches[0]?.clientX ?? 0
      const deltaX = endX - touchStartXRef.current

      if (deltaX <= -SWIPE_THRESHOLD_PX && value === 'video') {
        onChange('audio')
      } else if (deltaX >= SWIPE_THRESHOLD_PX && value === 'audio') {
        onChange('video')
      }
    },
    [disabled, onChange, value],
  )

  return (
    <div
      className={`mode-selector ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      role="tablist"
      aria-label="Recording mode"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {MODES.map((mode) => {
        const active = value === mode.id
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => handleModeClick(mode.id)}
            className={`mode-selector-item ${active ? 'mode-selector-item--active' : ''}`}
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}

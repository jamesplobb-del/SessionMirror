import { useCallback, useEffect, useRef } from 'react'
import type { RecordingMode } from '../types'

const MODES: { id: RecordingMode; label: string }[] = [
  { id: 'video', label: 'VIDEO' },
  { id: 'audio', label: 'AUDIO' },
]

interface RecordingModeCarouselProps {
  value: RecordingMode
  onChange: (mode: RecordingMode) => void
  disabled?: boolean
}

function nearestModeIndex(container: HTMLDivElement): number {
  const centerX = container.scrollLeft + container.clientWidth / 2
  let nearest = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  const items = container.querySelectorAll<HTMLElement>('[data-mode-index]')
  items.forEach((item) => {
    const itemCenter = item.offsetLeft + item.offsetWidth / 2
    const distance = Math.abs(itemCenter - centerX)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = Number(item.dataset.modeIndex)
    }
  })

  return nearest
}

export default function RecordingModeCarousel({
  value,
  onChange,
  disabled = false,
}: RecordingModeCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollEndTimerRef = useRef<number | null>(null)
  const isProgrammaticScrollRef = useRef(false)
  const didInitialScrollRef = useRef(false)

  const scrollToMode = useCallback((mode: RecordingMode, smooth: boolean) => {
    const container = scrollRef.current
    if (!container) return

    const index = MODES.findIndex((entry) => entry.id === mode)
    const item = container.querySelector<HTMLElement>(`[data-mode-index="${index}"]`)
    if (!item) return

    isProgrammaticScrollRef.current = true
    item.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: smooth ? 'smooth' : 'auto',
    })

    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, smooth ? 320 : 0)
  }, [])

  useEffect(() => {
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true
      scrollToMode(value, false)
      return
    }
    scrollToMode(value, true)
  }, [value, scrollToMode])

  const commitScrollSelection = useCallback(() => {
    const container = scrollRef.current
    if (!container || disabled || isProgrammaticScrollRef.current) return

    const index = nearestModeIndex(container)
    const mode = MODES[index]?.id
    if (mode && mode !== value) {
      onChange(mode)
    }
  }, [disabled, onChange, value])

  const handleScroll = useCallback(() => {
    if (scrollEndTimerRef.current !== null) {
      window.clearTimeout(scrollEndTimerRef.current)
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      scrollEndTimerRef.current = null
      commitScrollSelection()
    }, 80)
  }, [commitScrollSelection])

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current !== null) {
        window.clearTimeout(scrollEndTimerRef.current)
      }
    }
  }, [])

  const handleModeClick = useCallback(
    (mode: RecordingMode) => {
      if (disabled || mode === value) return
      onChange(mode)
    },
    [disabled, onChange, value],
  )

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={`mode-carousel no-scrollbar w-full max-w-[11rem] ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      role="tablist"
      aria-label="Recording mode"
    >
      <div className="mode-carousel-track">
        {MODES.map((mode, index) => {
          const active = value === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-mode-index={index}
              disabled={disabled}
              onClick={() => handleModeClick(mode.id)}
              className={`mode-carousel-item ${active ? 'mode-carousel-item--active' : ''}`}
            >
              {mode.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

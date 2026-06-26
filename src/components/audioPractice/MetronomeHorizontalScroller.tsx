import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { triggerLightHaptic } from '../../utils/haptics'

const TAP_MOVE_THRESHOLD_PX = 12
const SCROLL_DELTA_THRESHOLD_PX = 3
const DEFAULT_VISIBLE_COLUMNS = 5

function isChipVisibleInTrack(track: HTMLElement, chip: HTMLElement): boolean {
  const trackRect = track.getBoundingClientRect()
  const chipRect = chip.getBoundingClientRect()
  return chipRect.left >= trackRect.left - 2 && chipRect.right <= trackRect.right + 2
}

interface MetronomeScrollChipProps {
  scrollKey: string
  label: string
  active?: boolean
  onPress: () => void
  children?: ReactNode
  className?: string
}

export function MetronomeScrollChip({
  scrollKey,
  label,
  active = false,
  onPress,
  children,
  className = '',
}: MetronomeScrollChipProps) {
  const gestureRef = useRef({ x: 0, y: 0, scrollLeft: 0 })

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const track = event.currentTarget.closest<HTMLElement>('.metronome-h-scroll__track')
    gestureRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: track?.scrollLeft ?? 0,
    }
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const track = event.currentTarget.closest<HTMLElement>('.metronome-h-scroll__track')
    const { x, y, scrollLeft } = gestureRef.current
    const dx = Math.abs(event.clientX - x)
    const dy = Math.abs(event.clientY - y)
    const scrolled =
      track !== null && Math.abs(track.scrollLeft - scrollLeft) > SCROLL_DELTA_THRESHOLD_PX

    if (scrolled || dx > TAP_MOVE_THRESHOLD_PX || dy > TAP_MOVE_THRESHOLD_PX) return

    triggerLightHaptic()
    onPress()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onPress()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={active}
      data-scroll-key={scrollKey}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={[
        'metronome-h-scroll__chip',
        'metronome-audio-stage__btn',
        'pointer-events-auto',
        active ? 'metronome-audio-stage__btn--active' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

interface MetronomeHorizontalScrollerProps {
  label: string
  ariaLabel: string
  selectedKey?: string
  visibleColumns?: number
  children: ReactNode
  className?: string
}

export default function MetronomeHorizontalScroller({
  label,
  ariaLabel,
  selectedKey,
  visibleColumns = DEFAULT_VISIBLE_COLUMNS,
  children,
  className = '',
}: MetronomeHorizontalScrollerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const didInitialScrollResetRef = useRef(false)

  useEffect(() => {
    const track = trackRef.current
    if (!track || didInitialScrollResetRef.current) return
    track.scrollLeft = 0
    didInitialScrollResetRef.current = true
  }, [children])

  useEffect(() => {
    if (!selectedKey) return
    const track = trackRef.current
    if (!track) return

    const selected = track.querySelector<HTMLElement>(`[data-scroll-key="${selectedKey}"]`)
    if (!selected) return

    if (isChipVisibleInTrack(track, selected)) return

    selected.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [selectedKey])

  return (
    <div
      className={['metronome-h-scroll', 'metronome-h-scroll--five-wide', className]
        .filter(Boolean)
        .join(' ')}
      style={{ '--mhs-columns': visibleColumns } as CSSProperties}
    >
      <div className="metronome-h-scroll__label">{label}</div>
      <div
        ref={trackRef}
        className="metronome-h-scroll__track pointer-events-auto"
        role="group"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>
  )
}

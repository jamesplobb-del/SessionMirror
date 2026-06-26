import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { triggerLightHaptic } from '../../utils/haptics'

const TAP_MOVE_THRESHOLD_PX = 12
const TAP_SUPPRESS_MS = 200
const DEFAULT_VISIBLE_COLUMNS = 5

interface ScrollTapGuard {
  shouldSuppressTap: () => boolean
}

const ScrollTapGuardContext = createContext<ScrollTapGuard | null>(null)

export function useScrollTapGuard(): ScrollTapGuard | null {
  return useContext(ScrollTapGuardContext)
}

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
  const scrollGuard = useScrollTapGuard()
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start) return

    const dx = Math.abs(event.clientX - start.x)
    const dy = Math.abs(event.clientY - start.y)
    if (dx > TAP_MOVE_THRESHOLD_PX || dy > TAP_MOVE_THRESHOLD_PX) return
    if (scrollGuard?.shouldSuppressTap()) return

    triggerLightHaptic()
    onPress()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pointerStartRef.current = null
      }}
      onKeyDown={handleKeyDown}
      className={[
        'metronome-h-scroll__chip',
        'metronome-audio-stage__btn',
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
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressUntilRef = useRef(0)
  const didInitialScrollResetRef = useRef(false)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)

  const markScrollGesture = useCallback(() => {
    suppressUntilRef.current = Date.now() + TAP_SUPPRESS_MS
  }, [])

  const scrollGuard = useMemo<ScrollTapGuard>(
    () => ({
      shouldSuppressTap: () => Date.now() < suppressUntilRef.current,
    }),
    [],
  )

  const updateFades = useCallback(() => {
    const track = trackRef.current
    if (!track) return

    const { scrollLeft, scrollWidth, clientWidth } = track
    const overflow = scrollWidth - clientWidth > 2
    setFadeLeft(overflow && scrollLeft > 4)
    setFadeRight(overflow && scrollLeft + clientWidth < scrollWidth - 4)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    if (!didInitialScrollResetRef.current) {
      track.scrollLeft = 0
      didInitialScrollResetRef.current = true
    }

    const onPointerDown = (event: globalThis.PointerEvent) => {
      pointerStartRef.current = { x: event.clientX, y: event.clientY }
    }

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const start = pointerStartRef.current
      if (!start) return
      const dx = Math.abs(event.clientX - start.x)
      const dy = Math.abs(event.clientY - start.y)
      if (dx > TAP_MOVE_THRESHOLD_PX || dy > TAP_MOVE_THRESHOLD_PX) {
        markScrollGesture()
      }
    }

    const onTouchMove = () => {
      markScrollGesture()
    }

    const onPointerEnd = () => {
      pointerStartRef.current = null
    }

    const onScroll = () => {
      markScrollGesture()
      updateFades()
    }

    track.addEventListener('pointerdown', onPointerDown, { capture: true })
    track.addEventListener('pointermove', onPointerMove, { capture: true })
    track.addEventListener('pointerup', onPointerEnd, { capture: true })
    track.addEventListener('pointercancel', onPointerEnd, { capture: true })
    track.addEventListener('touchmove', onTouchMove, { passive: true })
    track.addEventListener('scroll', onScroll, { passive: true })

    updateFades()

    const observer = new ResizeObserver(() => updateFades())
    observer.observe(track)

    return () => {
      track.removeEventListener('pointerdown', onPointerDown, { capture: true })
      track.removeEventListener('pointermove', onPointerMove, { capture: true })
      track.removeEventListener('pointerup', onPointerEnd, { capture: true })
      track.removeEventListener('pointercancel', onPointerEnd, { capture: true })
      track.removeEventListener('touchmove', onTouchMove)
      track.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [markScrollGesture, updateFades, children])

  useEffect(() => {
    if (!selectedKey) return
    const track = trackRef.current
    if (!track) return

    const selected = track.querySelector<HTMLElement>(`[data-scroll-key="${selectedKey}"]`)
    if (!selected) return

    if (isChipVisibleInTrack(track, selected)) {
      window.requestAnimationFrame(updateFades)
      return
    }

    selected.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
    window.requestAnimationFrame(updateFades)
  }, [selectedKey, updateFades])

  return (
    <ScrollTapGuardContext.Provider value={scrollGuard}>
      <div
        className={[
          'metronome-h-scroll',
          'metronome-h-scroll--five-wide',
          fadeLeft ? 'metronome-h-scroll--fade-left' : '',
          fadeRight ? 'metronome-h-scroll--fade-right' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ '--mhs-columns': visibleColumns } as CSSProperties}
      >
        <div className="metronome-h-scroll__label">{label}</div>
        <div className="metronome-h-scroll__viewport">
          <div
            ref={trackRef}
            className="metronome-h-scroll__track"
            role="group"
            aria-label={ariaLabel}
          >
            {children}
          </div>
        </div>
      </div>
    </ScrollTapGuardContext.Provider>
  )
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

const TAP_MOVE_THRESHOLD_PX = 10
const TAP_SUPPRESS_MS = 140

interface ScrollTapGuard {
  shouldSuppressTap: () => boolean
}

const ScrollTapGuardContext = createContext<ScrollTapGuard | null>(null)

export function useScrollTapGuard(): ScrollTapGuard | null {
  return useContext(ScrollTapGuardContext)
}

interface MetronomeHorizontalScrollerProps {
  label: string
  ariaLabel: string
  selectedKey?: string
  children: ReactNode
  className?: string
}

export default function MetronomeHorizontalScroller({
  label,
  ariaLabel,
  selectedKey,
  children,
  className = '',
}: MetronomeHorizontalScrollerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressUntilRef = useRef(0)
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

    const onPointerDown = (event: PointerEvent) => {
      pointerStartRef.current = { x: event.clientX, y: event.clientY }
    }

    const onPointerMove = (event: PointerEvent) => {
      const start = pointerStartRef.current
      if (!start) return
      const dx = Math.abs(event.clientX - start.x)
      const dy = Math.abs(event.clientY - start.y)
      if (dx > TAP_MOVE_THRESHOLD_PX || dy > TAP_MOVE_THRESHOLD_PX) {
        markScrollGesture()
      }
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
    track.addEventListener('scroll', onScroll, { passive: true })

    updateFades()

    const observer = new ResizeObserver(() => updateFades())
    observer.observe(track)

    return () => {
      track.removeEventListener('pointerdown', onPointerDown, { capture: true })
      track.removeEventListener('pointermove', onPointerMove, { capture: true })
      track.removeEventListener('pointerup', onPointerEnd, { capture: true })
      track.removeEventListener('pointercancel', onPointerEnd, { capture: true })
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

    selected.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    window.requestAnimationFrame(updateFades)
  }, [selectedKey, updateFades])

  return (
    <ScrollTapGuardContext.Provider value={scrollGuard}>
      <div
        className={[
          'metronome-h-scroll',
          'metronome-h-scroll--centered',
          fadeLeft ? 'metronome-h-scroll--fade-left' : '',
          fadeRight ? 'metronome-h-scroll--fade-right' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
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

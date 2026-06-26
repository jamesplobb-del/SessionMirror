import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

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
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)

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

    updateFades()

    const onScroll = () => updateFades()
    track.addEventListener('scroll', onScroll, { passive: true })

    const observer = new ResizeObserver(() => updateFades())
    observer.observe(track)

    return () => {
      track.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [updateFades, children])

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
    <div
      className={[
        'metronome-h-scroll',
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
  )
}

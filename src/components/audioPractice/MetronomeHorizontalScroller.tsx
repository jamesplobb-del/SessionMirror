import type { ReactNode } from 'react'

interface MetronomeHorizontalScrollerProps {
  label: string
  ariaLabel: string
  children: ReactNode
  className?: string
}

export default function MetronomeHorizontalScroller({
  label,
  ariaLabel,
  children,
  className = '',
}: MetronomeHorizontalScrollerProps) {
  return (
    <div className={`metronome-h-scroll ${className}`.trim()}>
      <div className="metronome-h-scroll__label">{label}</div>
      <div className="metronome-h-scroll__track" role="group" aria-label={ariaLabel}>
        {children}
      </div>
    </div>
  )
}

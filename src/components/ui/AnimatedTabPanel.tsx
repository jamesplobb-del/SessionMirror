import { type ReactNode } from 'react'

interface AnimatedTabPanelProps {
  /** Stable identity for this panel — pass the same key used by the caller's own conditional. */
  panelKey: string
  active: boolean
  children: ReactNode
  className?: string
  dataTutorial?: string
}

/**
 * Mutually-exclusive tab panel.
 *
 * This intentionally swaps immediately. Keeping the outgoing camera, tuner,
 * game, or waveform tree mounted for a crossfade made two media-heavy screens
 * compete for a WebKit frame and produced a visible flash on iPhone.
 */
export default function AnimatedTabPanel({
  panelKey,
  active,
  children,
  className,
  dataTutorial,
}: AnimatedTabPanelProps) {
  if (!active) return null

  return (
    <div
      key={panelKey}
      className={className}
      data-tutorial={dataTutorial}
      style={{ position: 'absolute', inset: 0 }}
    >
      {children}
    </div>
  )
}

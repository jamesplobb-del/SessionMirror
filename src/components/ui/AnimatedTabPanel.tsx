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
 * Incoming content plays a short settle (same idea as the Games world enter).
 * The outgoing tree is not kept mounted — crossfading two media-heavy screens
 * made them compete for a WebKit frame and flashed on iPhone.
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
      className={`audio-tab-arrive ${className ?? ''}`.trim()}
      data-tutorial={dataTutorial}
      style={{ position: 'absolute', inset: 0 }}
    >
      {children}
    </div>
  )
}

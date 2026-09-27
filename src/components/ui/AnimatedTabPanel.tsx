import { type ReactNode } from 'react'

interface AnimatedTabPanelProps {
  /** Stable identity for this panel — pass the same key used by the caller's own conditional. */
  panelKey: string
  active: boolean
  children: ReactNode
  className?: string
  dataTutorial?: string
  /** Libraries retain selection/import state while their panel is hidden. */
  keepMounted?: boolean
}

/** Mount the active media panel immediately; animate its presentation only.
 * An outgoing tuner/readout never stays behind the next screen. The full
 * viewport background and audio lifecycle belong to the parent, not motion. */
export default function AnimatedTabPanel({
  panelKey,
  active,
  children,
  className,
  dataTutorial,
  keepMounted = false,
}: AnimatedTabPanelProps) {
  if (!active && !keepMounted) return null

  return (
    <div
      key={panelKey}
      className={`${className ?? ''} premium-tab-panel${active ? ' premium-tab-panel--active' : ''}`}
      data-tutorial={dataTutorial}
      data-active-panel={active ? panelKey : undefined}
      hidden={!active}
      inert={!active}
      style={{ position: 'absolute', inset: 0, ...(!active ? { display: 'none' } : {}) }}
    >
      {children}
    </div>
  )
}

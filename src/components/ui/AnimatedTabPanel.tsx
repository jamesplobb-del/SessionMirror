import { type ReactNode } from 'react'

interface AnimatedTabPanelProps {
  /** Stable identity for this panel — pass the same key used by the caller's own conditional. */
  panelKey: string
  active: boolean
  children: ReactNode
  className?: string
  dataTutorial?: string
}

/** One active media panel, painted immediately without scaling/fading the
 * entire camera/tuner surface on every tab selection. */
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

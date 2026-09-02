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
 * Mount exactly one tab panel at a time. Keeping an outgoing panel alive for a
 * crossfade briefly ran two microphone/canvas/audio engines together, which
 * caused dropped frames and memory spikes on iPhone. The shared absolute
 * wrapper still prevents differently-sized tabs from shifting the HUD.
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

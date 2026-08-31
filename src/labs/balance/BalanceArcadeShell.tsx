import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'

interface BalanceArcadeShellProps {
  title: string
  hapticFeedback: boolean
  onBack: () => void
  backLabel?: string
  /** Small readout at the top right — best time, star count. */
  stat?: { label: string; value: string } | null
  /** Rendered below the bar, inside the scrolling body. */
  children: ReactNode
  /** Rendered after the body, outside the scroll — the trail's play dock. */
  footer?: ReactNode
  className?: string
  /** The trail manages its own scrolling, so it opts the body out. */
  scrollBody?: boolean
}

/**
 * The sky every arcade screen sits in, plus the bar across the top.
 *
 * The clouds are five gradient blobs rather than an image: they scale to any
 * screen without a second asset, and drifting them costs one transform.
 */
export default function BalanceArcadeShell({
  title,
  hapticFeedback,
  onBack,
  backLabel = 'Back',
  stat,
  children,
  footer,
  className = '',
  scrollBody = true,
}: BalanceArcadeShellProps) {
  return (
    <div className={`balance-arcade ${className}`}>
      <div className="balance-arcade__sky" aria-hidden>
        <i /><i /><i /><i /><i />
      </div>

      <header className="balance-arcade__bar">
        <Pressable
          intensity="icon"
          hapticFeedback={hapticFeedback}
          className="balance-round-button"
          onClick={onBack}
          aria-label={backLabel}
        >
          <ArrowLeft aria-hidden />
        </Pressable>
        <p className="balance-arcade__bar-title">{title}</p>
        {stat ? (
          <p className="balance-arcade__bar-stat">
            <small>{stat.label}</small>
            <strong>{stat.value}</strong>
          </p>
        ) : (
          <span />
        )}
      </header>

      <div
        className="balance-arcade__body"
        style={scrollBody ? undefined : { overflow: 'hidden', paddingBottom: 0 }}
      >
        {children}
      </div>

      {footer}
    </div>
  )
}

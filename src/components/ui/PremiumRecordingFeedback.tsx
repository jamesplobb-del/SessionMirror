import type { CSSProperties } from 'react'
import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { AlertCircle, X } from 'lucide-react'
import { PremiumMotionDiv } from './PremiumMotionSurface'
import { premiumMotion } from '../../utils/premiumMotion'
import '../../styles/premium-recording.css'

/** Indeterminate activity, never a pretend percentage or a recorded waveform. */
export function PremiumActivity({ complete = false, className = '' }: { complete?: boolean; className?: string }) {
  return <span className={`premium-activity ${className}`} data-complete={complete} aria-hidden="true">
    <span className="premium-activity__ticks">{Array.from({ length: 12 }, (_, index) =>
      <i key={index} style={{ '--tick': index } as CSSProperties} />)}</span>
    <svg className="premium-activity__check" viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-8" /></svg>
  </span>
}

/** The same surface stays mounted as saving becomes success. State changes
 * immediately; only the presentation settles. No focus or media ownership. */
export function PremiumStatusToast({ message, tone = 'success', onDismiss }: {
  message: string | null
  tone?: 'busy' | 'success' | 'info' | 'error'
  onDismiss?: () => void
}) {
  const reduced = useReducedMotion()
  return <div className="premium-status-anchor">
    <AnimatePresence>{message && <PremiumMotionDiv key="feedback"
      className={`premium-status premium-status--${tone}`}
      initial={{ opacity: 0, y: reduced ? 0 : -14, scale: reduced ? 1 : .94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduced ? 0 : -8, scale: reduced ? 1 : .97 }}
      transition={premiumMotion({ duration: .1 }, 'panel')}
      role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true">
      <span className="premium-status__symbol" aria-hidden="true">
        {tone === 'error' || tone === 'info' ? <AlertCircle /> : <PremiumActivity complete={tone === 'success'} />}
      </span>
      <span className="premium-status__copy" key={message}>{message}</span>
      {onDismiss && <button type="button" className="premium-status__close" onClick={onDismiss} aria-label="Dismiss message"><X aria-hidden="true" /></button>}
    </PremiumMotionDiv>}</AnimatePresence>
  </div>
}

/** Playback preparation lives on the take it belongs to. */
export function TakePlaybackStatus({ active, busy }: { active: boolean; busy: boolean }) {
  const reduced = useReducedMotion()
  return <AnimatePresence>{active && <PremiumMotionDiv className="premium-playback-status"
    initial={{ opacity: 0, y: reduced ? 0 : -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
    transition={premiumMotion({ duration: .1 }, 'popover')} role="status">
    {busy && <PremiumActivity />}<span>{busy ? 'Preparing playback' : 'Couldn’t play this take. Tap to retry.'}</span>
  </PremiumMotionDiv>}</AnimatePresence>
}

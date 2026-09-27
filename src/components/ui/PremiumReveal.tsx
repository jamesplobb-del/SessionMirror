import { AnimatePresence, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { premiumMotion } from '../../utils/premiumMotion'
import { PremiumMotionDiv } from './PremiumMotionSurface'

/** Small form sections unfold in place; a departing section cannot take input. */
export default function PremiumReveal({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return <AnimatePresence initial={false}>{open && <PremiumMotionDiv
    className={className} style={{ overflow: 'hidden' }}
    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
    transition={reduced ? { duration: 0 } : premiumMotion({ duration: 0 }, 'popover')}>
    {children}
  </PremiumMotionDiv>}</AnimatePresence>
}

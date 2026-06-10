import { AnimatePresence, motion } from 'framer-motion'
import { type ReactNode } from 'react'
import { iosSpring } from '../../utils/motionPresets'

interface AnimatedExpandProps {
  open: boolean
  children: ReactNode
  className?: string
}

/** iOS-style height expand/collapse for nested settings sections. */
export default function AnimatedExpand({ open, children, className = '' }: AnimatedExpandProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={`overflow-hidden ${className}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={iosSpring}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

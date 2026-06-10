import { AnimatePresence, motion } from 'framer-motion'
import { type ReactNode } from 'react'
import { iosEaseOut, motionGpuLayer } from '../../utils/motionPresets'

interface AnimatedExpandProps {
  open: boolean
  children: ReactNode
  className?: string
}

/** Lightweight expand — opacity + slide only (no height layout thrash). */
export default function AnimatedExpand({ open, children, className = '' }: AnimatedExpandProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={className}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={iosEaseOut}
          style={motionGpuLayer}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

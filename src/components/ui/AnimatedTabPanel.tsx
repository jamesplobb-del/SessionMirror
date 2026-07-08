import { AnimatePresence, motion } from 'framer-motion'
import { type ReactNode } from 'react'
import { iosFade, motionGpuLayer } from '../../utils/motionPresets'

interface AnimatedTabPanelProps {
  /** Stable identity for this panel — pass the same key used by the caller's own conditional. */
  panelKey: string
  active: boolean
  children: ReactNode
  className?: string
  dataTutorial?: string
}

/**
 * Crossfade between mutually-exclusive tab panels — opacity only (a slide
 * would read as layout shift). Panels are absolutely positioned so the
 * outgoing and incoming panel overlay each other during the ~220ms crossfade
 * instead of both occupying flex flow at once — without this, two
 * differently-sized panels briefly both contributing to layout made the
 * parent visibly resize/bounce mid-transition ("rubber band"). Render every
 * panel inside a single shared `position: relative` wrapper that reserves the
 * flex space (see the four call sites in App.tsx).
 */
export default function AnimatedTabPanel({
  panelKey,
  active,
  children,
  className,
  dataTutorial,
}: AnimatedTabPanelProps) {
  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.div
          key={panelKey}
          className={className}
          data-tutorial={dataTutorial}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={iosFade}
          style={{ ...motionGpuLayer, position: 'absolute', inset: 0 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

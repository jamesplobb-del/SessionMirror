import { motion, useIsPresent, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

/** Animate the screen container; leave each feature's artwork and controls intact. */
export default function PremiumScene({ children, direction, scene, game = false }: {
  children: ReactNode
  direction: number
  scene: string
  game?: boolean
}) {
  const reduced = useReducedMotion()
  const present = useIsPresent()
  const still = reduced || game
  return <motion.div
    className="premium-scene"
    data-premium-scene={scene}
    inert={!present}
    aria-hidden={!present || undefined}
    custom={direction}
    initial={still ? { opacity: 0 } : { opacity: 0, transform: `translateX(${direction * 32}px) scale(.965)` }}
    animate={{ opacity: 1, transform: 'translateX(0px) scale(1)' }}
    exit="leave"
    variants={{ leave: (nextDirection: number) => ({
      opacity: 0,
      transform: still ? 'translateX(0px) scale(1)' : `translateX(${nextDirection * -18}px) scale(.985)`,
      transition: { duration: still ? .1 : .162, ease: [.4, 0, 1, 1] },
    }) }}
    transition={{ duration: still ? .12 : .684, ease: [.16, 1, .3, 1] }}
    style={{ pointerEvents: present ? 'auto' : 'none', zIndex: present ? 1 : 0 }}
  >{children}</motion.div>
}

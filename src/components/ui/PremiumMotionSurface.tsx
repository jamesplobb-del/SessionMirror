import { forwardRef } from 'react'
import { motion, useIsPresent, type HTMLMotionProps } from 'framer-motion'

// A long closing animation must release input immediately. Otherwise a
// departing drawer can swallow the next tap on the control underneath it.
export const PremiumMotionDiv = forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(
  function PremiumMotionDiv({ style, ...props }, ref) {
    const present = useIsPresent()
    return <motion.div {...props} ref={ref} inert={!present || props.inert}
      style={{ ...style, ...(!present ? { pointerEvents: 'none' as const } : {}) }} />
  },
)

export const PremiumMotionSection = forwardRef<HTMLElement, HTMLMotionProps<'section'>>(
  function PremiumMotionSection({ style, ...props }, ref) {
    const present = useIsPresent()
    return <motion.section {...props} ref={ref} inert={!present || props.inert}
      style={{ ...style, ...(!present ? { pointerEvents: 'none' as const } : {}) }} />
  },
)

export const PremiumMotionButton = forwardRef<HTMLButtonElement, HTMLMotionProps<'button'>>(
  function PremiumMotionButton({ style, ...props }, ref) {
    const present = useIsPresent()
    return <motion.button {...props} ref={ref} inert={!present || props.inert}
      style={{ ...style, ...(!present ? { pointerEvents: 'none' as const } : {}) }} />
  },
)

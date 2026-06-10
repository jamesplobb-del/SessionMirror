import { forwardRef, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { iosSpringTap, motionTap, motionTapIcon, motionTapSoft } from '../../utils/motionPresets'

export interface PressableProps extends HTMLMotionProps<'button'> {
  intensity?: 'soft' | 'normal' | 'icon'
  children?: ReactNode
}

const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { intensity = 'normal', transition, whileTap, children, type = 'button', ...props },
  ref,
) {
  const tapScale =
    intensity === 'icon' ? motionTapIcon : intensity === 'soft' ? motionTapSoft : motionTap

  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={whileTap ?? tapScale}
      transition={transition ?? iosSpringTap}
      {...props}
    >
      {children}
    </motion.button>
  )
})

export default Pressable

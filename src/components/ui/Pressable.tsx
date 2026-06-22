import { forwardRef, useCallback, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { triggerLightHaptic, triggerMediumHaptic } from '../../utils/haptics'
import { NATIVE_SQUISH } from '../../utils/interactiveUx'

export interface PressableProps extends HTMLMotionProps<'button'> {
  intensity?: 'soft' | 'normal' | 'icon'
  /** Fires Capacitor haptic on press when enabled. */
  haptic?: 'light' | 'medium' | false
  hapticFeedback?: boolean
  children?: ReactNode
}

const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  {
    intensity: _intensity = 'normal',
    haptic = false,
    hapticFeedback = true,
    transition,
    whileTap,
    className = '',
    onClick,
    type = 'button',
    children,
    ...props
  },
  ref,
) {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (haptic === 'medium') {
        triggerMediumHaptic(hapticFeedback)
      } else if (haptic === 'light') {
        triggerLightHaptic(hapticFeedback)
      }
      onClick?.(event)
    },
    [haptic, hapticFeedback, onClick],
  )

  return (
    <motion.button
      ref={ref}
      type={type}
      className={`${NATIVE_SQUISH} ${className}`.trim()}
      whileTap={whileTap}
      transition={transition}
      onClick={handleClick}
      {...props}
    >
      {children}
    </motion.button>
  )
})

export default Pressable

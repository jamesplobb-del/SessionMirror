import { forwardRef, useCallback, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import {
  triggerErrorHaptic,
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
  triggerWarningHaptic,
} from '../../utils/haptics'
import { NATIVE_SQUISH } from '../../utils/interactiveUx'
import {
  iosPressTransition,
  motionTap,
  motionTapIcon,
  motionTapSoft,
} from '../../utils/motionPresets'

export type PressableHaptic = 'light' | 'medium' | 'success' | 'warning' | 'error' | false

export interface PressableProps extends HTMLMotionProps<'button'> {
  intensity?: 'soft' | 'normal' | 'icon'
  /** When false, skips squish scale (for elements that already animate transform). */
  squish?: boolean
  /** Fires haptic on press when enabled. */
  haptic?: PressableHaptic
  hapticFeedback?: boolean
  children?: ReactNode
}

function runPressableHaptic(kind: PressableHaptic, enabled: boolean): void {
  switch (kind) {
    case 'medium':
      triggerMediumHaptic(enabled)
      break
    case 'success':
      triggerSuccessHaptic(enabled)
      break
    case 'warning':
      triggerWarningHaptic(enabled)
      break
    case 'error':
      triggerErrorHaptic(enabled)
      break
    case 'light':
      triggerLightHaptic(enabled)
      break
    default:
      break
  }
}

function defaultWhileTap(intensity: 'soft' | 'normal' | 'icon') {
  switch (intensity) {
    case 'soft':
      return motionTapSoft
    case 'icon':
      return motionTapIcon
    default:
      return motionTap
  }
}

const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  {
    intensity = 'normal',
    squish = true,
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
      if (haptic) {
        runPressableHaptic(haptic, hapticFeedback)
      }
      onClick?.(event)
    },
    [haptic, hapticFeedback, onClick],
  )

  const squishClass = squish
    ? NATIVE_SQUISH
    : 'select-none [-webkit-tap-highlight-color:transparent]'
  const tapMotion = squish ? whileTap ?? defaultWhileTap(intensity) : whileTap

  return (
    <motion.button
      ref={ref}
      type={type}
      className={`${squishClass} ${className}`.trim()}
      whileTap={tapMotion}
      transition={transition ?? iosPressTransition}
      onClick={handleClick}
      {...props}
    >
      {children}
    </motion.button>
  )
})

export default Pressable

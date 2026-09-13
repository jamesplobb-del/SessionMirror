import { forwardRef, useCallback, type ReactNode } from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import {
  triggerErrorHaptic,
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerModeSwitchHaptic,
  triggerSuccessHaptic,
  triggerWarningHaptic,
} from '../../utils/haptics'
import { NATIVE_SQUISH } from '../../utils/interactiveUx'
import { iosPressTransition } from '../../utils/motionPresets'

export type PressableHaptic = 'light' | 'medium' | 'rigid' | 'success' | 'warning' | 'error' | false

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
    case 'rigid':
      triggerModeSwitchHaptic(enabled)
      break
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

const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  {
    intensity = 'normal',
    squish = true,
    haptic = 'light',
    hapticFeedback = true,
    transition,
    whileTap,
    className = '',
    onClick,
    onPointerDown,
    type = 'button',
    children,
    ...props
  },
  ref,
) {
  const reduceMotion = useReducedMotion()
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (haptic && event.isPrimary && event.button === 0 && !event.currentTarget.disabled) {
        runPressableHaptic(haptic, hapticFeedback)
      }
      onPointerDown?.(event)
    },
    [haptic, hapticFeedback, onPointerDown],
  )

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // Keyboard / accessibility activation has detail 0 and never saw pointerdown.
      if (haptic && event.detail === 0) {
        runPressableHaptic(haptic, hapticFeedback)
      }
      onClick?.(event)
    },
    [haptic, hapticFeedback, onClick],
  )

  const squishClass = squish
    ? NATIVE_SQUISH
    : 'ui-pressable select-none [-webkit-tap-highlight-color:transparent]'

  return (
    <motion.button
      ref={ref}
      type={type}
      className={`${squishClass} ${className}`.trim()}
      // Standard presses use CSS :active, which does not wait for Motion's
      // next JS frame. Explicit custom animations still belong to the caller.
      data-press-feedback={whileTap ? undefined : squish ? intensity : 'none'}
      whileTap={reduceMotion ? undefined : whileTap}
      transition={transition ?? iosPressTransition}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      {...props}
    >
      {children}
    </motion.button>
  )
})

export default Pressable

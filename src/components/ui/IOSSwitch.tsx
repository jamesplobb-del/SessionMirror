import { motion } from 'framer-motion'
import { iosSpringSnappy } from '../../utils/motionPresets'
import { triggerLightHaptic } from '../../utils/haptics'
import { NATIVE_SQUISH } from '../../utils/interactiveUx'

interface IOSSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  hapticFeedback?: boolean
}

export default function IOSSwitch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  hapticFeedback = true,
}: IOSSwitchProps) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        triggerLightHaptic(hapticFeedback)
        onChange(!checked)
      }}
      className={`relative mt-0.5 flex h-9 w-[3.75rem] min-h-[44px] min-w-[52px] shrink-0 items-center justify-center rounded-full p-0.5 ${NATIVE_SQUISH} ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
      animate={{
        backgroundColor: checked ? '#0ea5e9' : '#d6d3d1',
      }}
      transition={iosSpringSnappy}
    >
      <motion.span
        className="block h-7 w-7 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18)]"
        animate={{ x: checked ? 24 : 0 }}
        transition={iosSpringSnappy}
      />
    </motion.button>
  )
}

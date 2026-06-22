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
      onClick={() => {
        triggerLightHaptic(hapticFeedback)
        onChange(!checked)
      }}
      className={`relative mt-1 h-7 w-[3.25rem] shrink-0 rounded-full p-0.5 ${NATIVE_SQUISH} ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
      animate={{
        backgroundColor: checked ? '#5ce625' : '#d6d3d1',
      }}
      transition={iosSpringSnappy}
    >
      <motion.span
        className="block h-6 w-6 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18)]"
        animate={{ x: checked ? 22 : 0 }}
        transition={iosSpringSnappy}
      />
    </motion.button>
  )
}

import { motion } from 'framer-motion'
import { iosSpringSnappy } from '../../utils/motionPresets'

interface IOSSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}

export default function IOSSwitch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: IOSSwitchProps) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-1 h-7 w-[3.25rem] shrink-0 rounded-full p-0.5 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
      animate={{
        backgroundColor: checked ? '#d97706' : '#3f3f46',
      }}
      transition={iosSpringSnappy}
      whileTap={disabled ? undefined : { scale: 0.96 }}
    >
      <motion.span
        className="block h-6 w-6 rounded-full bg-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
        animate={{ x: checked ? 22 : 0 }}
        transition={iosSpringSnappy}
      />
    </motion.button>
  )
}

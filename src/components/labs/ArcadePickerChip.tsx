import { ChevronDown } from 'lucide-react'
import { triggerLightHaptic } from '../../utils/haptics'

export interface ArcadePickerOption<T extends string | number> {
  value: T
  label: string
}

interface ArcadePickerChipProps<T extends string | number> {
  label: string
  value: T
  /** What the chip reads, when it should differ from the option's own label. */
  display?: string
  options: readonly ArcadePickerOption<T>[]
  hapticFeedback: boolean
  /** The chip's look: `balance-cycle` on the ready rows, `balance-chip` on Quick Play. */
  className?: string
  onChange: (value: T) => void
}

/**
 * A ready-screen setting picked from a list rather than stepped through.
 *
 * A transparent native `<select>` covers the chip, so a tap opens the system
 * picker — the scrolling wheel on iPhone. Keep it rendered in place: iOS
 * closes an open picker the moment its `<select>` is replaced, and the game
 * screens re-render on every microphone reading.
 */
export default function ArcadePickerChip<T extends string | number>({
  label,
  value,
  display,
  options,
  hapticFeedback,
  className = 'balance-cycle',
  onChange,
}: ArcadePickerChipProps<T>) {
  const current = options.find((option) => option.value === value)

  return (
    <label className={`${className} arcade-picker`}>
      <small>{label}</small>
      <strong>
        <span>{display ?? current?.label ?? String(value)}</span>
        <ChevronDown aria-hidden />
      </strong>
      <select
        className="arcade-picker__select"
        aria-label={label}
        value={String(value)}
        onChange={(event) => {
          const next = options.find((option) => String(option.value) === event.target.value)
          if (!next) return
          void triggerLightHaptic(hapticFeedback)
          onChange(next.value)
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

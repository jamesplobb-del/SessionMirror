import { ChevronDown } from 'lucide-react'
import { triggerLightHaptic } from '../../utils/haptics'

export interface MetronomeAudioSelectOption<T extends string> {
  value: T
  label: string
}

interface MetronomeAudioSelectProps<T extends string> {
  label: string
  ariaLabel: string
  value: T
  options: MetronomeAudioSelectOption<T>[]
  onChange: (value: T) => void
}

export default function MetronomeAudioSelect<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: MetronomeAudioSelectProps<T>) {
  return (
    <label className="metronome-audio-select pointer-events-auto">
      <span className="metronome-audio-select__label">{label}</span>
      <div className="metronome-audio-select__field">
        <select
          className="metronome-audio-select__control interactive-native"
          value={value}
          aria-label={ariaLabel}
          onChange={(event) => {
            const next = event.target.value as T
            if (next === value) return
            triggerLightHaptic()
            onChange(next)
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="metronome-audio-select__chevron" strokeWidth={2.2} aria-hidden />
      </div>
    </label>
  )
}

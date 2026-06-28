import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
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
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown, { capture: true })
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`metronome-audio-select pointer-events-auto ${open ? 'metronome-audio-select--open' : ''}`}>
      <span className="metronome-audio-select__label">{label}</span>
      <div className="metronome-audio-select__field">
        <button
          type="button"
          className="metronome-audio-select__control interactive-native"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => {
            triggerLightHaptic()
            setOpen((visible) => !visible)
          }}
        >
          <span className="metronome-audio-select__value">{selectedOption?.label ?? value}</span>
        </button>
        <ChevronDown className="metronome-audio-select__chevron" strokeWidth={2.2} aria-hidden />
        {open && (
          <div
            id={listboxId}
            className="metronome-audio-select__menu"
            role="listbox"
            aria-label={ariaLabel}
          >
            {options.map((option) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`metronome-audio-select__option ${selected ? 'metronome-audio-select__option--selected' : ''}`}
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    if (!selected) {
                      triggerLightHaptic()
                      onChange(option.value)
                    }
                    setOpen(false)
                  }}
                >
                  <span>{option.label}</span>
                  {selected && <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

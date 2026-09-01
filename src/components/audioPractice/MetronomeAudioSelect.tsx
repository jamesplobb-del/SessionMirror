import { Check, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { triggerLightHaptic } from '../../utils/haptics'
import { iosEaseOut, motionGpuLayer } from '../../utils/motionPresets'

export interface MetronomeAudioSelectOption<T extends string> {
  value: T
  label: string
  /** Compact value used only in the closed field; menus keep the full label. */
  shortLabel?: string
  /**
   * Drawn stand-in for the value — shown instead of the text in the closed
   * field, and beside the label in the menu. The label still carries the
   * accessible name, so a glyph never has to be readable to be usable.
   */
  glyph?: ReactNode
  /** Secondary line in the menu, e.g. what a rhythm does to the beat. */
  hint?: string
  /** Non-selectable section header or divider row */
  disabled?: boolean
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
          aria-label={selectedOption ? `${ariaLabel}: ${selectedOption.label}` : ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => {
            triggerLightHaptic()
            setOpen((visible) => !visible)
          }}
        >
          <span className="metronome-audio-select__selection">
            {selectedOption?.glyph ? (
              <span className="metronome-audio-select__glyph" aria-hidden>
                {selectedOption.glyph}
              </span>
            ) : (
              <span className="metronome-audio-select__value">
                {selectedOption?.shortLabel ?? selectedOption?.label ?? value}
              </span>
            )}
            <ChevronDown
              className="metronome-audio-select__chevron"
              strokeWidth={2.2}
              aria-hidden
            />
          </span>
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              id={listboxId}
              className="metronome-audio-select__menu"
              role="listbox"
              aria-label={ariaLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={iosEaseOut}
              style={motionGpuLayer}
            >
              <motion.div
                className="metronome-audio-select__menu-content"
                initial={{ y: -7, scale: 0.975 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: -5, scale: 0.985 }}
                transition={iosEaseOut}
                style={motionGpuLayer}
              >
                {options.map((option) => {
                  if (option.disabled) {
                    return (
                      <div
                        key={option.value}
                        className="metronome-audio-select__option metronome-audio-select__option--header"
                        role="presentation"
                      >
                        {option.label}
                      </div>
                    )
                  }

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
                      <span className="metronome-audio-select__option-body">
                        {option.glyph ? (
                          <span className="metronome-audio-select__option-glyph" aria-hidden>
                            {option.glyph}
                          </span>
                        ) : null}
                        <span className="metronome-audio-select__option-text">
                          <span>{option.label}</span>
                          {option.hint ? (
                            <span className="metronome-audio-select__option-hint">{option.hint}</span>
                          ) : null}
                        </span>
                      </span>
                      {selected && <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />}
                    </button>
                  )
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

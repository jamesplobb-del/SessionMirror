import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import Pressable from '../ui/Pressable'
import { PremiumPicker } from '../ui/PremiumPicker'

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

export default function MetronomeAudioSelect<T extends string>({ label, ariaLabel, value, options, onChange }: MetronomeAudioSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.value === value) ?? options[0]
  return <div className={`metronome-audio-select pointer-events-auto ${open ? 'metronome-audio-select--open' : ''}`}>
    <span className="metronome-audio-select__label">{label}</span>
    <div className="metronome-audio-select__field">
      <Pressable type="button" className="metronome-audio-select__control" intensity="soft"
        aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="metronome-audio-select__selection">
          {selected?.glyph ? <span className="metronome-audio-select__glyph" aria-hidden>{selected.glyph}</span>
            : <span className="metronome-audio-select__value">{selected?.shortLabel ?? selected?.label ?? value}</span>}
          <ChevronDown className="metronome-audio-select__chevron" strokeWidth={1.7} aria-hidden />
        </span>
      </Pressable>
    </div>
    <PremiumPicker isOpen={open} title={ariaLabel} value={value}
      options={options.map(option => ({ ...option, section: option.disabled }))}
      onChange={onChange} onClose={() => setOpen(false)} />
  </div>
}

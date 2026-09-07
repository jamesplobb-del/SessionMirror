import { useEffect, useRef, useState } from 'react'
import { triggerLightHaptic } from '../../utils/haptics'

interface EditableNumberValueProps {
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
  ariaLabel: string
  suffix?: string
  /**
   * Text to show instead of the raw number — for steppers that read as words
   * ("Off", "Once", "3×"). Typing still edits the underlying number.
   */
  displayValue?: string
  className?: string
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export default function EditableNumberValue({
  value,
  min,
  max,
  onCommit,
  ariaLabel,
  suffix,
  displayValue,
  className = '',
}: EditableNumberValueProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [editing, value])

  useEffect(() => {
    if (!editing) return
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [editing])

  const commit = () => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) {
      onCommit(clampNumber(parsed, min, max))
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`practice-timeline-editor__stepper-value practice-timeline-editor__stepper-input ${className}`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            setDraft(String(value))
            setEditing(false)
          }
        }}
      />
    )
  }

  // The pill is a text field in disguise, so say so as well as showing it.
  return (
    <button
      type="button"
      className={`practice-timeline-editor__stepper-value practice-timeline-editor__stepper-value--editable ${className}`}
      aria-label={ariaLabel}
      title="Tap to type a value"
      onClick={(event) => {
        event.stopPropagation()
        triggerLightHaptic()
        setDraft(String(value))
        setEditing(true)
      }}
    >
      {displayValue ?? value}
      {displayValue === undefined && suffix ? (
        <span className="practice-timeline-editor__stepper-value-suffix">{suffix}</span>
      ) : null}
    </button>
  )
}

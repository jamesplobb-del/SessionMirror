import { useId } from 'react'
import { TUNER_INSTRUMENTS, type TunerInstrument } from '../../utils/pitchConfig'
import './tuner-sensitivity.css'

// These stops reuse the existing detector profiles; no pitch thresholds change.
export const TUNER_SENSITIVITY_LABELS = ['Smooth', 'Balanced', 'Responsive'] as const
const descriptions = [
  'Steadies the readout through vibrato and sustained notes.',
  'Balances a steady trace with clear note changes.',
  'Follows quick note changes with a faster readout.',
]

export default function TunerSensitivityControl({ value, onChange }: {
  value: TunerInstrument
  onChange: (value: TunerInstrument) => void
}) {
  const id = useId()
  const index = Math.max(0, TUNER_INSTRUMENTS.indexOf(value))
  return <div className="tuner-sensitivity">
    <label htmlFor={id}>Sensitivity <strong>{TUNER_SENSITIVITY_LABELS[index]}</strong></label>
    <input id={id} type="range" min={0} max={2} step={1} value={index}
      aria-label="Sensitivity" aria-valuetext={TUNER_SENSITIVITY_LABELS[index]} aria-describedby={`${id}-help`}
      onChange={event => onChange(TUNER_INSTRUMENTS[Number(event.currentTarget.value)])} />
    <div className="tuner-sensitivity__stops" aria-hidden="true">
      {TUNER_SENSITIVITY_LABELS.map(label => <span key={label}>{label}</span>)}
    </div>
    <p id={`${id}-help`}>{descriptions[index]}</p>
  </div>
}

import { Check, X } from 'lucide-react'
import { memo } from 'react'
import {
  TUNER_KEY_OPTIONS,
  getTunerKeyOption,
  getTunerOctaveOptions,
  tunerOctaveLabel,
  type TunerTranspositionId,
} from '../../utils/tunerTransposition'
import type { TunerInstrument } from '../../utils/pitchConfig'
import TunerSensitivityControl from './TunerSensitivityControl'

export interface TunerTranspositionMenuProps {
  error?: string
  concertOnly?: boolean
  value: TunerTranspositionId
  onChange: (value: TunerTranspositionId) => void
  onClose: () => void
  instrument?: TunerInstrument
  /** Detection profile — how forgiving the tuner is about what it hears. */
  onInstrumentChange?: (value: TunerInstrument) => void
}

function TunerTranspositionMenu({
  error,
  concertOnly = false,
  value,
  onChange,
  onClose,
  instrument,
  onInstrumentChange,
}: TunerTranspositionMenuProps) {
  const key = getTunerKeyOption(value)
  const octaveOptions = getTunerOctaveOptions(value)
  return (
    <section className="tuner-transposition-menu" aria-label="Tuner settings">
      <header className="tuner-transposition-menu__header">
        <div>
          <h2><span className="electric-tuning-old">Tuner settings</span><span className="electric-tuning-new">Tuning</span></h2>
          <span>Note names follow your written part. Cents stay at concert pitch.</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close tuner settings">
          <X aria-hidden />
        </button>
      </header>

      <div className="tuner-transposition-menu__body">
      {error && <p className="tuner-key-error" role="alert">{error}</p>}
      {instrument && onInstrumentChange ? (
        <div className="tuner-settings-source">
          <TunerSensitivityControl value={instrument} onChange={onInstrumentChange} />
        </div>
      ) : null}

      {!concertOnly && <section className="tuner-key-settings" aria-label="Tuning key">
        <h3>Key</h3>
        <div className="tuner-key-options" role="group" aria-label="Instrument key">
          {TUNER_KEY_OPTIONS.map(option => <button key={option.id} type="button"
            aria-label={option.keyLabel} aria-pressed={option.id === key.id}
            onClick={() => onChange(option.id === key.id ? value : option.id)}>
            {option.keyLabel}{option.id === key.id && <Check aria-hidden />}
          </button>)}
        </div>
        {octaveOptions.length > 1 && <details className="tuner-key-octave" key={key.id}>
          <summary>Octave adjustment{value !== key.id ? ` · ${tunerOctaveLabel(value)}` : ''}</summary>
          <label>Written part
            <select aria-label="Written octave" value={value} onChange={event => onChange(event.currentTarget.value as TunerTranspositionId)}>
              {octaveOptions.map(option => <option key={option.id} value={option.id}>{tunerOctaveLabel(option.id)}</option>)}
            </select>
          </label>
        </details>}
      </section>}
      </div>
    </section>
  )
}

export default memo(TunerTranspositionMenu)

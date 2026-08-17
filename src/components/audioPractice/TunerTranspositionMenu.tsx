import { Check, X } from 'lucide-react'
import { memo, useEffect, useRef } from 'react'
import {
  TUNER_TRANSPOSITION_GROUPS,
  TUNER_TRANSPOSITION_OPTIONS,
  type TunerTranspositionId,
} from '../../utils/tunerTransposition'
import { getTunerProfile, TUNER_INSTRUMENTS, type TunerInstrument } from '../../utils/pitchConfig'

interface TunerTranspositionMenuProps {
  value: TunerTranspositionId
  onChange: (value: TunerTranspositionId) => void
  onClose: () => void
  instrument?: TunerInstrument
  /** Detection profile — how forgiving the tuner is about what it hears. */
  onInstrumentChange?: (value: TunerInstrument) => void
}

function TunerTranspositionMenu({
  value,
  onChange,
  onClose,
  instrument,
  onInstrumentChange,
}: TunerTranspositionMenuProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <section className="tuner-transposition-menu" aria-label="Tuner settings">
      <header className="tuner-transposition-menu__header">
        <div>
          <h2>Tuner settings</h2>
          <span>Note names follow your part. Cents stay at concert pitch.</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close tuner settings">
          <X aria-hidden />
        </button>
      </header>

      {instrument && onInstrumentChange ? (
        <div className="tuner-settings-source">
          <p className="tuner-settings-source__label">Instrument</p>
          <div role="radiogroup" aria-label="Instrument">
            {TUNER_INSTRUMENTS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={id === instrument}
                className={id === instrument ? 'is-selected' : ''}
                onClick={() => onInstrumentChange(id)}
              >
                {getTunerProfile(id).label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="tuner-transposition-menu__list" role="radiogroup" aria-label="Instrument">
        {TUNER_TRANSPOSITION_GROUPS.map((group) => (
          <div className="tuner-transposition-menu__group" key={group}>
            <p>{group}</p>
            <div>
              {TUNER_TRANSPOSITION_OPTIONS.filter((option) => option.group === group).map(
                (option) => {
                  const selected = option.id === value
                  return (
                    <button
                      key={option.id}
                      ref={selected ? selectedRef : undefined}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={selected ? 'tuner-transposition-menu__option--selected' : ''}
                      onClick={() => onChange(option.id)}
                    >
                      <span className="tuner-transposition-menu__key" aria-hidden>
                        {option.keyLabel}
                      </span>
                      <span className="tuner-transposition-menu__copy">
                        <strong>{option.label}</strong>
                      </span>
                      <span className="tuner-transposition-menu__check" aria-hidden>
                        {selected ? <Check /> : null}
                      </span>
                    </button>
                  )
                },
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default memo(TunerTranspositionMenu)

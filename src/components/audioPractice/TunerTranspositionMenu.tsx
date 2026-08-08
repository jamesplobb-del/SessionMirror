import { Check, X } from 'lucide-react'
import { memo, useEffect, useRef } from 'react'
import {
  TUNER_TRANSPOSITION_GROUPS,
  TUNER_TRANSPOSITION_OPTIONS,
  type TunerTranspositionId,
} from '../../utils/tunerTransposition'

interface TunerTranspositionMenuProps {
  value: TunerTranspositionId
  onChange: (value: TunerTranspositionId) => void
  onClose: () => void
}

function TunerTranspositionMenu({
  value,
  onChange,
  onClose,
}: TunerTranspositionMenuProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <section className="tuner-transposition-menu" aria-label="Tuner transposition">
      <header className="tuner-transposition-menu__header">
        <div>
          <h2>Written pitch</h2>
          <span>Note names follow your part. Frequency and cents stay at concert pitch.</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close transposition menu">
          <X aria-hidden />
        </button>
      </header>

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
                        <small>{option.detail}</small>
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

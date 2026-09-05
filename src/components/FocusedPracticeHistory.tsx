import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { Take } from '../types'
import {
  countJournalDays,
  groupIntoSittings,
  toJournalAttempts,
} from '../utils/practiceJournal'
import '../styles/focus-practice.css'

export default function FocusedPracticeHistory({ name, takes, onClose, onListen, onCompare }: {
  name: string
  takes: Take[]
  onClose: () => void
  onListen: (take: Take) => void
  onCompare: (takeId: string, referenceId: string) => void
}) {
  const dialog = useRef<HTMLElement>(null)

  const attempts = useMemo(() => toJournalAttempts(takes), [takes])
  const sittings = useMemo(() => groupIntoSittings(attempts), [attempts])
  const dayCount = useMemo(() => countJournalDays(attempts), [attempts])
  const firstDay = attempts.length
    ? new Date(attempts[attempts.length - 1].take.timestamp).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })
    : null

  // Compare against where you started, until you pick something else.
  const [baselineId, setBaselineId] = useState(() => attempts[attempts.length - 1]?.take.id ?? '')
  const latestId = attempts[0]?.take.id ?? ''

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => previous?.focus()
  }, [])

  return createPortal(<div className="focus-history-layer" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} className="focus-history-card" role="dialog" aria-modal="true" aria-labelledby="focus-history-title" tabIndex={-1}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose() }
        if (event.key !== 'Tab') return
        const targets = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')
        if (!targets?.length) return
        const first = targets[0], last = targets[targets.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}>
      <header>
        <div>
          <span className="focus-eyebrow">Practice journal</span>
          <h2 id="focus-history-title">{name}</h2>
        </div>
        <button type="button" className="focus-icon-button" onClick={onClose} aria-label="Close practice journal"><X aria-hidden /></button>
      </header>

      {attempts.length > 0 && (
        <p className="focus-history-summary">
          <b>{attempts.length}</b> {attempts.length === 1 ? 'attempt' : 'attempts'}
          {' · '}<b>{dayCount}</b> {dayCount === 1 ? 'day' : 'days'}
          {firstDay && attempts.length > 1 && <> · first on {firstDay}</>}
        </p>
      )}

      {!attempts.length ? (
        <div className="focus-history-empty">
          <ol className="focus-spine">
            <li className="focus-node focus-node--ghost">
              <div className="focus-node-heading"><strong>Attempt 1</strong></div>
              <p>Your first take lands here, with the date and the note you set for it.</p>
            </li>
          </ol>
          <strong>Your first attempt starts the story.</strong>
          <p>Record a focused take. Its date, intention, and reflection will appear here.</p>
          <button type="button" onClick={onClose}>Back to practice</button>
        </div>
      ) : (
        <ol className="focus-spine">
          {sittings.map(sitting => (
            <li key={sitting.key} className="focus-sitting">
              <p className="focus-day">
                {sitting.dayLabel}
                {sitting.sittingLabel && <> · {sitting.sittingLabel}</>}
              </p>
              <ol>
                {sitting.attempts.map(({ take, number }) => {
                  const isBaseline = take.id === baselineId
                  const isLatest = take.id === latestId
                  return (
                    <li
                      key={take.id}
                      className={`focus-node ${isLatest ? 'focus-node--latest' : ''} ${isBaseline ? 'focus-node--baseline' : ''}`}
                    >
                      <button
                        type="button"
                        className="focus-node-marker"
                        aria-pressed={isBaseline}
                        aria-label={
                          isBaseline
                            ? `Attempt ${number} is the comparison baseline`
                            : `Compare against attempt ${number}`
                        }
                        onClick={() => setBaselineId(take.id)}
                      />
                      <div className="focus-node-heading">
                        <strong>Attempt {number}</strong>
                        <time dateTime={new Date(take.timestamp).toISOString()}>
                          {new Date(take.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </time>
                      </div>
                      {isBaseline && attempts.length > 1 && <span className="focus-node-chip">Baseline</span>}
                      {take.intention && <p><span>Intention</span>{take.intention}</p>}
                      {take.notes && <p><span>Reflection</span>{take.notes}</p>}
                      <div className="focus-node-foot">
                        {take.rating > 0 ? (
                          <span className="focus-meter" aria-label={`Your rating: ${take.rating} of 5`}>
                            {[1, 2, 3, 4, 5].map(step => (
                              <i key={step} className={step <= take.rating ? 'is-on' : ''} />
                            ))}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="focus-node-actions">
                          <button type="button" onClick={() => onListen(take)}>Listen</button>
                          {attempts.length > 1 && !isBaseline && baselineId && (
                            <button type="button" onClick={() => onCompare(take.id, baselineId)}>Compare</button>
                          )}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  </div>, document.body)
}

import { useEffect, useState } from 'react'
import { summarizePracticeSessions } from '../db/practiceRepository'
import { formatElapsed, loadRoutineHistory, type RoutineDay } from '../utils/practiceRoutines'

/** Existing recordings stay in the vault; this view only queries their sitting IDs. */
export default function RoutineProgressSummary({ day, onOpenHistory }: { day: RoutineDay | null; onOpenHistory?: (projectId: string, title: string) => void }) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof summarizePracticeSessions>> | null>(null)
  const [failed, setFailed] = useState(false)
  const ids = JSON.stringify(Object.values(day?.sessionIdsByStep ?? {}).flat())
  useEffect(() => {
    let cancelled = false
    setSummary(null)
    setFailed(false)
    void summarizePracticeSessions(JSON.parse(ids)).then(value => { if (!cancelled) setSummary(value) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [ids, day?.updatedAt])
  if (!day?.startedAt) return null
  const history = loadRoutineHistory(day.routineId).filter(item => item.date !== day.date && item.startedAt)
  const elapsed = Object.values(day.elapsedMsByStep).reduce((sum, ms) => sum + ms, 0)
  return <details className="routine-session-summary">
    <summary>{day.completedAt ? 'Session recap' : 'Session progress'}</summary>
    <p>{formatElapsed(elapsed)} active · {day.doneStepIds.length} completed · {day.skippedStepIds.length} skipped</p>
    {summary ? <p>{summary.attempts} saved {summary.attempts === 1 ? 'take' : 'takes'}
      {summary.bestTakes > 0 ? ` · ${summary.bestTakes} currently marked best` : ''}</p>
      : <p role="status">{failed ? 'Take counts are unavailable. Your recordings are still in the vault.' : 'Loading saved takes…'}</p>}
    {Object.keys(day.itemsByStep).length > 0 && <ul className="routine-recap-items">{Object.entries(day.itemsByStep).map(([id, item]) => <li key={id}>
      <span><strong>{item.title}</strong><small>{day.doneStepIds.includes(id) ? 'Completed' : day.skippedStepIds.includes(id) ? 'Skipped' : 'In progress'} · {formatElapsed(day.elapsedMsByStep[id] ?? 0)}</small></span>
      {item.projectId && onOpenHistory && <button type="button" onClick={() => onOpenHistory(item.projectId!, item.title)}>Journal</button>}
    </li>)}</ul>}
    {history.length > 0 && <details>
      <summary>Earlier practice · {history.length} {history.length === 1 ? 'day' : 'days'}</summary>
      <ul>{history.map(item => <li key={item.date}>
        <strong>{item.date}</strong> · {item.doneStepIds.length} completed · {item.skippedStepIds.length} skipped
        {' · '}{formatElapsed(Object.values(item.elapsedMsByStep).reduce((sum, ms) => sum + ms, 0))} active
        {onOpenHistory && <div className="routine-recap-history-links">{Object.entries(item.itemsByStep).map(([id, snapshot]) => snapshot.projectId
          ? <button type="button" key={id} onClick={() => onOpenHistory(snapshot.projectId!, snapshot.title)}>{snapshot.title}</button> : null)}</div>}
      </li>)}</ul>
    </details>}
  </details>
}

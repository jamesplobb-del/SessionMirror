import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, X } from 'lucide-react'
import type { Routine } from '../utils/practiceRoutines'
import { hasPracticeChart, practiceChartName } from '../utils/practiceChartStorage'
import { sharePracticeRoutine } from '../utils/practiceRoutineShare'
import '../styles/routine-share-dialog.css'

/** Send the plan and score names; each recipient supplies their own files. */
export default function RoutineShareDialog({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const scoreNames = routine.steps.flatMap(step => {
    const name = step.sharedScoreName ?? (step.projectId && hasPracticeChart(step.projectId)
      ? practiceChartName(step.projectId) ?? step.title : null)
    return name && step.desk?.showMusic ? [name] : []
  })
  const share = async () => {
    if (busy) return
    setBusy(true); setError('')
    const result = await sharePracticeRoutine(routine)
    setBusy(false)
    if (result.ok) onClose()
    else setError(result.error)
  }
  return createPortal(<div className="routine-share-backdrop" onPointerDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="routine-share-dialog" role="dialog" aria-modal="true" aria-labelledby="routine-share-title" onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose() } }}>
      <header><div><span>SHARE ROUTINE</span><h2 id="routine-share-title">Send {routine.name}</h2></div><button type="button" autoFocus aria-label="Close sharing" disabled={busy} onClick={onClose}><X aria-hidden /></button></header>
      <div className="routine-share-layout"><FileText aria-hidden /><div><strong>Routine layout</strong><p>The exercise order, tools, references and metronome settings go with it. Music files and recordings stay on your device.</p></div></div>
      {scoreNames.length > 0 && <div className="routine-share-import-list"><span>THEY’LL ADD THEIR OWN MUSIC</span><ul>{scoreNames.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul></div>}
      <button type="button" className="routine-share-send" disabled={busy} onClick={() => void share()}>{busy ? 'Preparing…' : 'Share routine layout'}</button>
      {error && <p className="routine-share-error" role="alert">{error}</p>}
    </section>
  </div>, document.body)
}

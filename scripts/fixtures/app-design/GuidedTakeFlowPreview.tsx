import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Mic, X } from 'lucide-react'
import './guided-take-flow.css'

export type GuidedFocus = 'tone' | 'posture' | 'timing' | 'expression' | 'breathing' | 'intonation' | 'articulation'

const focusLabels: Record<GuidedFocus, string> = {
  tone: 'Tone',
  posture: 'Posture',
  timing: 'Timing',
  expression: 'Expression',
  breathing: 'Breathing',
  intonation: 'Intonation',
  articulation: 'Articulation',
}

const allGoals = Object.keys(focusLabels) as GuidedFocus[]

export function GuidedGoalPicker({
  goals,
  onSave,
  onClose,
}: {
  goals: GuidedFocus[]
  onSave: (goals: GuidedFocus[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(goals)
  const toggle = (goal: GuidedFocus) => setDraft(current => current.includes(goal) ? current.filter(item => item !== goal) : [...current, goal])
  return (
    <div className="lens-guided-goal-layer" role="dialog" aria-modal="true" aria-label="Choose practice goals">
      <button type="button" className="lens-guided-goal-scrim" aria-hidden="true" tabIndex={-1} onClick={onClose} />
      <div className="lens-guided-goal-sheet">
        <button type="button" className="lens-guided-goal-close" aria-label="Close practice goals" onClick={onClose}><X size={18} aria-hidden /></button>
        <h2>Practice goals</h2>
        <p>Choose any. You can change these later.</p>
        <div className="lens-guided-goal-grid" role="group" aria-label="Practice goals">
          {allGoals.map(goal => <button key={goal} type="button" aria-pressed={draft.includes(goal)} onClick={() => toggle(goal)}><span>{focusLabels[goal]}</span><Check size={17} aria-hidden /></button>)}
        </div>
        <div className="lens-guided-goal-footer"><button type="button" className="lens-guided-goal-skip" onClick={() => onSave([])}>Skip for now</button><button type="button" className="lens-guided-goal-save" onClick={() => onSave(draft)}>Done</button></div>
      </div>
    </div>
  )
}

export function GuidedReview({
  focus,
  goals,
  note,
  onFocusChange,
  onNoteChange,
  onEditGoals,
  onTryAgain,
  onCompare,
  hasBest,
}: {
  focus: string | null
  goals: GuidedFocus[]
  note: string
  onFocusChange: (focus: string | null) => void
  onNoteChange: (note: string) => void
  onEditGoals: () => void
  onTryAgain: () => void
  onCompare: () => void
  hasBest: boolean
}) {
  const [voiceDemoOpen, setVoiceDemoOpen] = useState(false)
  const showVoiceFocus = Boolean(focus && !goals.some(goal => focusLabels[goal] === focus))
  const simulateVoice = (phrase: string) => {
    const goal = allGoals.find(option => focusLabels[option].toLowerCase() === phrase.toLowerCase())
    if (goal) onFocusChange(focusLabels[goal])
    else onNoteChange(phrase)
    setVoiceDemoOpen(false)
  }
  return (
    <section className="lens-guided-review" aria-label="Plan your next take">
      <div className="lens-guided-review-heading"><div><span>AFTER THIS TAKE</span><h2>Your next take</h2></div><small>Optional</small></div>
      <div className="lens-guided-review-body">
        <div className="lens-guided-note-row">
          <input id="guided-take-note" aria-label="Optional note about this take" value={note} onChange={event => onNoteChange(event.target.value)} placeholder="What did you notice? Add a note…" maxLength={160} />
          <button type="button" className="lens-guided-voice" aria-label="Try voice input preview" aria-expanded={voiceDemoOpen} onClick={() => setVoiceDemoOpen(open => !open)}><Mic size={17} aria-hidden /></button>
        </div>
        <div className="lens-guided-goals-head">
          <span>Focus for next take <small>optional</small></span>
          <button type="button" onClick={() => { setVoiceDemoOpen(false); onEditGoals() }}>{goals.length ? 'Edit goals' : 'Add goals'}<ChevronRight size={14} aria-hidden /></button>
        </div>
        {goals.length || showVoiceFocus ? <div className="lens-guided-choices" role="group" aria-label="Next take focus">
          {goals.map(goal => <button key={goal} type="button" aria-pressed={focus === focusLabels[goal]} onClick={() => onFocusChange(focus === focusLabels[goal] ? null : focusLabels[goal])}><span className="lens-guided-choice-mark"><Check size={11} aria-hidden /></span>{focusLabels[goal]}</button>)}
          {showVoiceFocus && <button type="button" aria-pressed="true" onClick={() => onFocusChange(null)}><span className="lens-guided-choice-mark"><Check size={11} aria-hidden /></span>{focus}</button>}
        </div> : null}
      </div>
      {voiceDemoOpen && <div className="lens-guided-voice-demo" role="dialog" aria-label="Voice input preview">
        <strong>Dictation preview</strong>
        <p>Sample phrases · microphone off</p>
        <button type="button" onClick={() => simulateVoice('Posture')}>“Posture” <span>Select focus</span></button>
        <button type="button" onClick={() => simulateVoice('I rushed the opening')}>“I rushed the opening” <span>Add note</span></button>
      </div>}
      <div className="lens-guided-actions">
        {hasBest && <button type="button" className="lens-guided-compare" onClick={onCompare}>Compare takes</button>}
        <button type="button" className="lens-guided-primary" onClick={onTryAgain}><span aria-hidden />Record again</button>
      </div>
    </section>
  )
}

export function GuidedRecordingCue({ focus }: { focus: string | null }) {
  if (!focus) return null
  return (
    <div className="lens-guided-recording-cue" role="status">
      <small>Focus</small>
      <strong>{focus}</strong>
    </div>
  )
}

export function GuidedCompareReturn({ onReturn }: { onReturn: () => void }) {
  return (
    <div className="lens-guided-compare-return">
      <button type="button" onClick={onReturn}><ChevronLeft size={16} aria-hidden /> Back to take</button>
    </div>
  )
}

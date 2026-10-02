import { useMemo, useState } from 'react'
import { ChevronLeft, FileMusic, Search } from 'lucide-react'
import type { Project } from '../db'
import ScoreThumbnail from './ScoreThumbnail'
import '../styles/music-setlists.css'

interface Props {
  title: string
  /** Where Back returns to, e.g. "Setlist". */
  backLabel: string
  /** The music library, in library order. */
  scores: Project[]
  /** Pick one and finish at once, or tick several and confirm. */
  mode: 'single' | 'multiple'
  /** How many times each score is already in the destination. */
  counts?: Record<string, number>
  /** How many more can be added. */
  capacity?: number
  confirmLabel?: (count: number) => string
  onBack: () => void
  /** Scores in the order they were tapped. */
  onPick: (scores: Project[]) => void
}

/** Chooses music from the library: thumbnails and titles, never a drop-down. */
export default function MusicScorePicker({ title, backLabel, scores, mode, counts = {}, capacity = Infinity, confirmLabel, onBack, onPick }: Props) {
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = useMemo(() => needle ? scores.filter(score => score.name.toLowerCase().includes(needle)) : scores, [scores, needle])
  const full = mode === 'multiple' && picked.length >= capacity
  const toggle = (id: string) => setPicked(current => current.includes(id) ? current.filter(item => item !== id) : full ? current : [...current, id])
  const confirm = () => onPick(picked.map(id => scores.find(score => score.id === id)).filter((score): score is Project => Boolean(score)))
  return <>
    <header className="music-sheet__header music-sheet__header--picker">
      <button type="button" className="music-sheet__back" onClick={onBack}><ChevronLeft aria-hidden /><span>{backLabel}</span></button>
      <h2>{title}</h2>
    </header>
    <div className="music-sheet__scroll">
      {scores.length > 6 && <label className="music-picker__search"><Search aria-hidden />
        <input type="search" aria-label="Find music" placeholder="Find music" value={query} onChange={event => setQuery(event.target.value)} /></label>}
      {!scores.length ? <div className="music-picker__empty"><FileMusic aria-hidden /><strong>No music yet</strong><p>Import PDFs or photos in the Music library, then add them here.</p></div>
        : !shown.length ? <p className="music-picker__none">No music matches “{query.trim()}”.</p>
        : <ul className="music-picker__list">{shown.map(score => {
          const order = picked.indexOf(score.id) + 1
          const already = counts[score.id] ?? 0
          const blocked = mode === 'multiple' && full && !order
          return <li key={score.id}><button type="button" className="music-picker__row" disabled={blocked}
            aria-pressed={mode === 'multiple' ? Boolean(order) : undefined}
            onClick={() => mode === 'single' ? onPick([score]) : toggle(score.id)}>
            <ScoreThumbnail projectId={score.id} revision={0} />
            <span className="music-picker__copy"><strong>{score.name}</strong>{already > 0 && <small>{already > 1 ? `In setlist ×${already}` : 'In setlist'}</small>}</span>
            {mode === 'multiple' && <span className="music-picker__mark" aria-hidden>{order || ''}</span>}
          </button></li>
        })}</ul>}
      {full && Number.isFinite(capacity) && <p className="music-picker__none" role="status">That is the most this setlist can hold.</p>}
    </div>
    {mode === 'multiple' && <footer className="music-sheet__footer music-sheet__footer--picker">
      <button type="button" className="music-sheet__primary" disabled={!picked.length} onClick={confirm}>
        {confirmLabel ? confirmLabel(picked.length) : picked.length ? `Add ${picked.length}` : 'Choose music'}</button>
    </footer>}
  </>
}

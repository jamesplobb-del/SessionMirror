import { useEffect, useId, useRef, useState } from 'react'
import { Bookmark, Search, X } from 'lucide-react'
import { getInstrumentProfile } from '../utils/instrumentProfiles'
import { loadReferenceLibrary } from '../utils/practiceReferences'
import { parseYoutubeVideoId } from '../utils/youtubeEmbed'
import { PracticeReferenceContext } from '../context/PracticeReferenceContext'
import PracticeReferenceBrowser from './PracticeReferenceBrowser'

export function routineReferenceSuggestion(instrumentId: string | null, title: string): string {
  const instrument = getInstrumentProfile(instrumentId ?? '')?.label.split(' / ')[0]
  return [instrumentId === 'other' ? '' : instrument, title.trim() || 'performance'].filter(Boolean).join(' ').slice(0, 80)
}

export default function RoutineReferenceSetup({ instrumentId, title, value, onChange, videoId, onVideoIdChange, inline = false }: {
  inline?: boolean
  instrumentId: string | null
  title: string
  value: string
  onChange: (value: string) => void
  videoId: string | null
  onVideoIdChange: (videoId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const suggestion = routineReferenceSuggestion(instrumentId, title)
  const pinned = loadReferenceLibrary().items.find(item => item.videoId === videoId)
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])

  const picker = <PracticeReferenceContext.Provider value={{ query: '', autoSearch: false }}>
    <PracticeReferenceBrowser savedAsTab suggestedQuery={suggestion} placeholder="Search YouTube or paste a video link…" selectionHelp="Choose a recording to open with this practice item." onSelect={url => {
      const id = parseYoutubeVideoId(url)
      if (!id) return
      onVideoIdChange(id)
      onChange('')
      setOpen(false)
    }} />
  </PracticeReferenceContext.Provider>

  return <section className="routine-reference-compact" aria-label="Reference for this item">
    {videoId ? <div className="routine-reference-pinned">
      <Bookmark aria-hidden />
      <div><strong>{pinned?.title ?? 'YouTube recording'}</strong><small>Ready when this item starts</small></div>
      <button type="button" onClick={() => { if (inline) onVideoIdChange(null); else setOpen(true) }}>Change</button>
      <button type="button" aria-label="Remove reference" onClick={() => { onVideoIdChange(null); onChange('') }}><X aria-hidden /></button>
    </div> : inline ? picker : <button type="button" className="routine-setup-action" onClick={() => setOpen(true)}>
      <Search aria-hidden /><span><strong>Add reference</strong><small>Search YouTube or paste a link · Optional</small></span>
    </button>}
    {!videoId && value.trim() && <div className="routine-reference-legacy"><small>Search on start: {value}</small><button type="button" onClick={() => onChange('')}>Clear</button></div>}
    <dialog ref={dialog} className="routine-reference-dialog" aria-labelledby={headingId} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      {open && <>
        <header><div><h2 id={headingId}>Find a reference</h2><p>{title}</p></div><button type="button" aria-label="Close references" onClick={() => setOpen(false)}><X aria-hidden /></button></header>
        <p>Find a recording to listen to and compare with your takes.</p>
        {picker}
      </>}
    </dialog>
  </section>
}

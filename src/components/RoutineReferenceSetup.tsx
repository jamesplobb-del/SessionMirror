import { useMemo, useState } from 'react'
import { Search, Play, Bookmark, Check, Link2, X } from 'lucide-react'
import { getInstrumentProfile } from '../utils/instrumentProfiles'
import { loadReferenceLibrary } from '../utils/practiceReferences'
import { parseYoutubeVideoId } from '../utils/youtubeEmbed'

export function routineReferenceSuggestion(instrumentId: string | null, title: string): string {
  const instrument = getInstrumentProfile(instrumentId ?? '')?.label.split(' / ')[0]
  return [instrumentId === 'other' ? '' : instrument, title.trim() || 'performance'].filter(Boolean).join(' ').slice(0, 80)
}

/**
 * Two ways to set a reference, and the difference matters:
 * pinning a recording here loads it the moment the item starts, while a search
 * term only opens the search for you to choose in the moment.
 */
export default function RoutineReferenceSetup({ instrumentId, title, value, onChange, videoId, onVideoIdChange }: {
  instrumentId: string | null
  title: string
  value: string
  onChange: (value: string) => void
  videoId: string | null
  onVideoIdChange: (videoId: string | null) => void
}) {
  const suggestion = routineReferenceSuggestion(instrumentId, title)
  const saved = useMemo(() => loadReferenceLibrary().items, [])
  const pinned = saved.find(item => item.videoId === videoId)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState('')

  const pinFromLink = () => {
    const parsed = parseYoutubeVideoId(link.trim())
    if (!parsed) { setLinkError('That doesn’t look like a YouTube link.'); return }
    setLinkError(''); setLink(''); onVideoIdChange(parsed)
  }

  return <section className="routine-reference-setup" aria-label="Reference for this item">
    <div className="routine-reference-setup__heading"><span><Search aria-hidden /></span><div><small>REFERENCE</small><h3>Hear how it’s played.</h3></div></div>

    {videoId ? <>
      <div className="routine-reference-pinned">
        <span className="routine-reference-pinned__mark" aria-hidden><Bookmark /></span>
        <div>
          <strong>{pinned?.title ?? 'Pinned recording'}</strong>
          <small>{pinned?.channel ?? `youtube.com · ${videoId}`}</small>
        </div>
        <button type="button" aria-label="Remove pinned reference" onClick={() => onVideoIdChange(null)}><X aria-hidden /></button>
      </div>
      <p className="routine-reference-setup__status" role="status">This recording opens automatically when you start the item.</p>
    </> : <>
      <p>Pin a recording and it opens with the item. Leave it unpinned and BestTake opens the search instead, so you can choose in the moment.</p>

      {saved.length > 0 && <div className="routine-reference-saved">
        <small>Saved references</small>
        {saved.slice(0, 4).map(item => <button type="button" key={item.videoId} className="routine-reference-saved__item"
          onClick={() => onVideoIdChange(item.videoId)}>
          <Play aria-hidden /><span><strong>{item.title}</strong><small>{item.channel}</small></span><Check className="routine-reference-saved__pin" aria-hidden />
        </button>)}
      </div>}

      <div className="routine-reference-link">
        <label className="practice-menu-field"><span>Paste a YouTube link</span>
          <input value={link} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            placeholder="youtube.com/watch?v=…"
            onChange={event => { setLink(event.target.value); setLinkError('') }}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); pinFromLink() } }} />
        </label>
        <button type="button" disabled={!link.trim()} onClick={pinFromLink}><Link2 aria-hidden />Pin</button>
      </div>
      {linkError && <p className="routine-reference-setup__error" role="alert">{linkError}</p>}

      <label className="practice-menu-field"><span>Or search for it when the item starts</span>
        <input value={value} maxLength={80} onChange={event => onChange(event.target.value)} placeholder={suggestion} /></label>
      <button type="button" className="routine-reference-setup__suggestion" aria-pressed={value === suggestion} onClick={() => onChange(value === suggestion ? '' : suggestion)}>{value === suggestion ? <Check aria-hidden /> : <Search aria-hidden />}<span>Find {suggestion}</span></button>
      <div className="routine-reference-setup__steps"><span><Search aria-hidden />We search</span><span><Play aria-hidden />You choose</span><span><Bookmark aria-hidden />Saved for next time</span></div>
      {value.trim() && <p className="routine-reference-setup__status" role="status">The search opens with this term when you start the item.</p>}
    </>}
  </section>
}

import { useContext, useEffect, useRef, useState } from 'react'
import { Bookmark, Search, Trash2 } from 'lucide-react'
import { PracticeReferenceContext } from '../context/PracticeReferenceContext'
import { loadReferenceLibrary, removePracticeReference, savePracticeReference, searchPracticeReferences, type PracticeReference } from '../utils/practiceReferences'
import { buildYoutubeProxyUrl } from '../utils/youtubeEmbed'
import '../styles/focus-practice.css'

export default function PracticeReferenceBrowser({ onSelect }: { onSelect: (url: string) => void }) {
  const { query: initialQuery, projectId, autoSearch } = useContext(PracticeReferenceContext)
  const [tab, setTab] = useState<'search' | 'saved'>(() => loadReferenceLibrary().items.some(item => item.projectIds.includes(projectId ?? '')) ? 'saved' : 'search')
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<PracticeReference[]>([])
  const [saved, setSaved] = useState(() => loadReferenceLibrary().items)
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const search = async () => {
    if (query.trim().length < 2) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    setResults([])
    setSearched(false)
    try {
      const items = await searchPracticeReferences(query, controller.signal)
      if (!controller.signal.aborted) { setResults(items); setSearched(true) }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Search failed. Please try again.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }
  useEffect(() => {
    if (autoSearch && tab === 'search' && initialQuery.trim().length >= 2) void search()
    // Initial suggestions only; subsequent searches are submitted by the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const choose = (item: PracticeReference) => {
    try {
      savePracticeReference(item, projectId)
      onSelect(buildYoutubeProxyUrl(item.videoId))
    } catch { setError('Could not save this reference. Please free up device storage and try again.') }
  }
  const items = tab === 'search' ? results : [...saved].sort((a, b) =>
    Number(b.projectIds.includes(projectId ?? '')) - Number(a.projectIds.includes(projectId ?? '')))
  return <section className="focus-reference-browser" aria-label="Reference library">
    <div className="focus-segments" role="group" aria-label="Find references">
      <button type="button" aria-pressed={tab === 'search'} onClick={() => { setTab('search'); setError('') }}><Search aria-hidden />Search YouTube</button>
      <button type="button" aria-pressed={tab === 'saved'} onClick={() => { setTab('saved'); setError('') }}><Bookmark aria-hidden />Saved ({saved.length})</button>
    </div>
    {tab === 'search' && <form onSubmit={event => { event.preventDefault(); void search() }}>
      <label htmlFor="reference-search">Piece, excerpt, or performer</label>
      <div className="focus-search-row">
        <input id="reference-search" value={query} maxLength={160} onChange={event => {
          request.current?.abort(); setLoading(false); setSearched(false); setResults([]); setError(''); setQuery(event.target.value)
        }} placeholder="Mahler 5 trumpet Michael Sachs" enterKeyHint="search" />
        <button type="submit" disabled={loading || query.trim().length < 2}>{loading ? 'Searching…' : 'Search'}</button>
      </div>
      <p className="focus-help">Choose a recording to save it and load it into your reference box.</p>
    </form>}
    {error && <p className="focus-error" role="alert">{error}</p>}
    <div aria-live="polite">
      {tab === 'search' && searched && !items.length && <p className="focus-help">No recordings found. Try the piece name and a performer.</p>}
      {tab === 'saved' && !items.length && <p className="focus-help">Your references will live here. Search above or load a link below to save your first.</p>}
    </div>
    <div className="focus-reference-results">
      {items.map(item => <article key={item.videoId}>
        <button type="button" className="focus-reference-result" onClick={() => choose(item)}>
          <span><strong>{item.title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')}</strong><small>{item.channel || 'YouTube'}{saved.some(ref => ref.videoId === item.videoId && ref.projectIds.includes(projectId ?? '')) ? ' · Saved for this focus' : ''}</small></span>
          <span className="focus-reference-use">Use reference</span>
        </button>
        {tab === 'saved' && <button type="button" className="focus-icon-button" aria-label={`Remove ${item.title} from saved references`} onClick={() => {
          try { removePracticeReference(item.videoId); setSaved(loadReferenceLibrary().items) }
          catch { setError('Could not update saved references. Please try again.') }
        }}><Trash2 aria-hidden /></button>}
      </article>)}
    </div>
  </section>
}

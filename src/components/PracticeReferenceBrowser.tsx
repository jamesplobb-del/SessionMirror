import { useContext, useEffect, useId, useRef, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import { PracticeReferenceContext } from '../context/PracticeReferenceContext'
import { loadReferenceLibrary, removePracticeReference, savePracticeReference, searchPracticeReferences, type PracticeReference } from '../utils/practiceReferences'
import { buildYoutubeProxyUrl, parseYoutubeVideoId } from '../utils/youtubeEmbed'
import '../styles/focus-practice.css'

const decode = (text: string) => text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')

/**
 * One surface, one gesture: search or paste in the same field, then tap any
 * row to load it. This used to be two tabs plus a separate paste form with its
 * own submit button, which meant four ways in and no obvious one.
 */
export default function PracticeReferenceBrowser({ onSelect, placeholder, selectionHelp, suggestedQuery, savedAsTab = false }: {
  onSelect: (url: string) => void
  suggestedQuery?: string
  placeholder?: string
  selectionHelp?: string
  savedAsTab?: boolean
}) {
  const searchId = useId()
  const [view, setView] = useState<'search' | 'saved'>('search')
  const { query: initialQuery, projectId, autoSearch } = useContext(PracticeReferenceContext)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<PracticeReference[]>([])
  const [saved, setSaved] = useState(() => loadReferenceLibrary().items)
  const [linkName, setLinkName] = useState('')
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  // A search term can look like a video ID, so this never blocks searching —
  // at worst it offers one extra row the musician ignores.
  const linkId = parseYoutubeVideoId(query)

  const search = async (searchQuery = query) => {
    if (searchQuery.trim().length < 2) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true); setError(''); setResults([]); setSearched(false)
    try {
      const items = await searchPracticeReferences(searchQuery, controller.signal)
      if (!controller.signal.aborted) { setResults(items); setSearched(true) }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Search failed. Please try again.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }

  useEffect(() => {
    if (autoSearch && initialQuery.trim().length >= 2 && !parseYoutubeVideoId(initialQuery)) void search()
    // Initial suggestions only; later searches are submitted by the musician.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = (item: PracticeReference) => {
    try {
      savePracticeReference(item, projectId)
      onSelect(buildYoutubeProxyUrl(item.videoId))
    } catch { setError('Could not save this reference. Please free up device storage and try again.') }
  }

  const savedForThis = (videoId: string) =>
    saved.some(ref => ref.videoId === videoId && ref.projectIds.includes(projectId ?? ''))

  const row = (item: PracticeReference, removable = false) => (
    <article key={item.videoId}>
      <button type="button" className="focus-reference-result" onClick={() => choose(item)}>
        <span>
          <strong>{decode(item.title)}</strong>
          <small>{item.channel || 'YouTube'}{savedForThis(item.videoId) ? ' · Saved for this item' : ''}</small>
        </span>
        <span className="focus-reference-use">Use</span>
      </button>
      {removable && <button type="button" className="focus-icon-button" aria-label={`Remove ${item.title} from saved references`} onClick={() => {
        try { removePracticeReference(item.videoId); setSaved(loadReferenceLibrary().items) }
        catch { setError('Could not update saved references. Please try again.') }
      }}><Trash2 aria-hidden /></button>}
    </article>
  )

  const sortedSaved = [...saved].sort((a, b) =>
    Number(b.projectIds.includes(projectId ?? '')) - Number(a.projectIds.includes(projectId ?? '')))

  return <section className="focus-reference-browser" aria-label="References">
    {savedAsTab && <div className="routine-segment" role="group" aria-label="Reference source">
      <button type="button" aria-pressed={view === 'search'} onClick={() => setView('search')}>Search or link</button>
      <button type="button" aria-pressed={view === 'saved'} onClick={() => setView('saved')}>Saved · {saved.length}</button>
    </div>}
    {view === 'search' && <>
    <form onSubmit={event => { event.preventDefault(); if (!linkId) void search() }}>
      <label htmlFor={searchId}>Search YouTube, or paste a link</label>
      <div className="focus-search-row">
        <Search aria-hidden className="focus-search-icon" />
        <input type="search" id={searchId} value={query} maxLength={160} inputMode="search"
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          onChange={event => {
            request.current?.abort(); setLoading(false); setSearched(false); setResults([]); setError(''); setQuery(event.target.value)
          }} placeholder={placeholder || "Piece, artist, or a YouTube link"} enterKeyHint="search" />
        {!linkId && <button type="submit" disabled={loading || query.trim().length < 2}>{loading ? 'Searching…' : 'Search'}</button>}
      </div>
      <p className="focus-help">{selectionHelp || 'Tap any recording to load it into your take box.'}</p>
      {suggestedQuery && <button type="button" className="focus-suggested-search" onClick={() => {
        setView('search'); setQuery(suggestedQuery); void search(suggestedQuery)
      }}><Search aria-hidden /><span>Search YouTube for “{suggestedQuery}”</span></button>}
    </form>


    {linkId && <div className="focus-reference-group">
      <h4>From your link</h4>
      <div className="focus-reference-results">
        {row({ videoId: linkId, title: linkName.trim() || 'YouTube link', channel: `youtube.com · ${linkId}` })}
      </div>
      <input className="focus-reference-name" value={linkName} maxLength={120}
        onChange={event => setLinkName(event.target.value)}
        placeholder="Name this reference (optional)" aria-label="Reference name" />
    </div>}

    <div aria-live="polite">
      {searched && !results.length && !linkId && <p className="focus-help">No recordings found. Try the piece name and a performer.</p>}
    </div>

    {results.length > 0 && <div className="focus-reference-group">
      <h4>Search results</h4>
      <div className="focus-reference-results">{results.map(item => row(item))}</div>
    </div>}

    </>}
    {error && <p className="focus-error" role="alert">{error}</p>}
    {(!savedAsTab || view === 'saved') && <div className="focus-reference-group">
      <h4>Saved{saved.length ? ` · ${saved.length}` : ''}</h4>
      {sortedSaved.length
        ? <div className="focus-reference-results">{sortedSaved.map(item => row(item, true))}</div>
        : <p className="focus-help">Recordings you use are kept here, ready for next time.</p>}
    </div>}
  </section>
}

import { useContext, useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
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
export default function PracticeReferenceBrowser({ onSelect }: { onSelect: (url: string) => void }) {
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

  const search = async () => {
    if (query.trim().length < 2) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true); setError(''); setResults([]); setSearched(false)
    try {
      const items = await searchPracticeReferences(query, controller.signal)
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
    <form onSubmit={event => { event.preventDefault(); void search() }}>
      <label htmlFor="reference-search">Search YouTube, or paste a link</label>
      <div className="focus-search-row">
        <input id="reference-search" value={query} maxLength={160} inputMode="search"
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          onChange={event => {
            request.current?.abort(); setLoading(false); setSearched(false); setResults([]); setError(''); setQuery(event.target.value)
          }} placeholder="Mahler 5 trumpet Michael Sachs" enterKeyHint="search" />
        <button type="submit" disabled={loading || query.trim().length < 2}>{loading ? 'Searching…' : 'Search'}</button>
      </div>
      <p className="focus-help">Tap any recording to load it into your take box.</p>
    </form>

    {error && <p className="focus-error" role="alert">{error}</p>}

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

    <div className="focus-reference-group">
      <h4>Saved{saved.length ? ` · ${saved.length}` : ''}</h4>
      {sortedSaved.length
        ? <div className="focus-reference-results">{sortedSaved.map(item => row(item, true))}</div>
        : <p className="focus-help">Recordings you use are kept here, ready for next time.</p>}
    </div>
  </section>
}

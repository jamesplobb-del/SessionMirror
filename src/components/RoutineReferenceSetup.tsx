import { Bookmark, X } from 'lucide-react'
import { getInstrumentProfile } from '../utils/instrumentProfiles'
import { loadReferenceLibrary } from '../utils/practiceReferences'
import { parseYoutubeVideoId } from '../utils/youtubeEmbed'
import { PracticeReferenceContext } from '../context/PracticeReferenceContext'
import PracticeReferenceBrowser from './PracticeReferenceBrowser'

export function routineReferenceSuggestion(instrumentId: string | null, title: string): string {
  const instrument = getInstrumentProfile(instrumentId ?? '')?.label.split(' / ')[0]
  return [instrumentId === 'other' ? '' : instrument, title.trim() || 'performance'].filter(Boolean).join(' ').slice(0, 80)
}

export default function RoutineReferenceSetup({ instrumentId, title, value, onChange, videoId, onVideoIdChange }: {
  instrumentId: string | null
  title: string
  value: string
  onChange: (value: string) => void
  videoId: string | null
  onVideoIdChange: (videoId: string | null) => void
}) {
  const suggestion = routineReferenceSuggestion(instrumentId, title)
  const pinned = loadReferenceLibrary().items.find(item => item.videoId === videoId)

  if (videoId) {
    return <section className="routine-reference-compact" aria-label="Reference for this item">
      <div className="routine-reference-pinned">
        <Bookmark aria-hidden />
        <div>
          <strong>{pinned?.title ?? 'YouTube recording'}</strong>
          <small>Ready when this item starts</small>
        </div>
        <button type="button" onClick={() => { onVideoIdChange(null); onChange('') }}>Change</button>
        <button type="button" aria-label="Remove reference" onClick={() => { onVideoIdChange(null); onChange('') }}><X aria-hidden /></button>
      </div>
    </section>
  }

  return <section className="routine-reference-compact" aria-label="Reference for this item">
    <PracticeReferenceContext.Provider value={{ query: '', autoSearch: false }}>
      <PracticeReferenceBrowser
        suggestedQuery={suggestion}
        placeholder="Search YouTube or paste a video link…"
        selectionHelp="Choose a recording to open with this practice item."
        onSelect={url => {
          const id = parseYoutubeVideoId(url)
          if (!id) return
          onVideoIdChange(id)
          onChange('')
        }}
      />
    </PracticeReferenceContext.Provider>
    {value.trim() ? <div className="routine-reference-legacy">
      <small>Search on start: {value}</small>
      <button type="button" onClick={() => onChange('')}>Clear</button>
    </div> : null}
  </section>
}

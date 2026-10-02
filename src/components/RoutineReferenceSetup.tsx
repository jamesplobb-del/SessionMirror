import { useEffect, useRef, useState } from 'react'
import { Bookmark, ChevronLeft, ChevronRight, FileAudio, Youtube, X } from 'lucide-react'
import { getInstrumentProfile } from '../utils/instrumentProfiles'
import { loadReferenceLibrary } from '../utils/practiceReferences'
import { parseYoutubeVideoId } from '../utils/youtubeEmbed'
import { showPlus } from '../plus/plusAccess'
import { usePlus } from '../plus/usePlus'
import { PracticeReferenceContext } from '../context/PracticeReferenceContext'
import { useReferenceAudio } from '../context/ReferenceAudioContext'
import type { ReferenceAudioRef } from '../utils/practiceRoutines'
import { formatAudioDuration, prepareReferenceAudioFile, REFERENCE_AUDIO_ACCEPT } from '../utils/routineMusic'
import PracticeReferenceBrowser from './PracticeReferenceBrowser'

export function routineReferenceSuggestion(instrumentId: string | null, title: string): string {
  const instrument = getInstrumentProfile(instrumentId ?? '')?.label.split(' / ')[0]
  return [instrumentId === 'other' ? '' : instrument, title.trim() || 'performance'].filter(Boolean).join(' ').slice(0, 80)
}

/** Where a recording from Files is kept, and how the exercise gets a practice item to hold it. */
export interface ReferenceAudioSetup {
  value: ReferenceAudioRef | null
  /** The practice item that holds the file today; null until the exercise has one. */
  projectId: string | null
  /** Resolves the item that will hold the file, creating one if needed. */
  ensureProject: () => Promise<string>
  onChange: (value: ReferenceAudioRef | null) => void
}

export default function RoutineReferenceSetup({ instrumentId, title, value, onChange, videoId, onVideoIdChange, audio }: {
  instrumentId: string | null
  title: string
  value: string
  onChange: (value: string) => void
  videoId: string | null
  onVideoIdChange: (videoId: string | null) => void
  /** Offered only where recordings can be stored. Without it, YouTube is the one source. */
  audio?: ReferenceAudioSetup
}) {
  const plus = usePlus()
  const store = useReferenceAudio()
  const picker = useRef<HTMLInputElement>(null)
  const [youtubeOpen, setYoutubeOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)
  const suggestion = routineReferenceSuggestion(instrumentId, title)
  const pinned = loadReferenceLibrary().items.find(item => item.videoId === videoId)
  const audioEnabled = Boolean(audio && store)
  const audioItemId = audio?.value?.itemId ?? null
  const audioProjectId = audio?.projectId ?? null

  // A recording removed from the practice item's library should say so here, not at the start.
  useEffect(() => {
    setMissing(false)
    if (!store || !audioItemId) return
    let alive = true
    if (!audioProjectId) { setMissing(true); return }
    void store.hasAudio(audioProjectId, audioItemId).then(found => { if (alive) setMissing(!found) }).catch(() => { /* Keep the pin; starting will report a real problem. */ })
    return () => { alive = false }
  }, [store, audioItemId, audioProjectId])

  const chooseFile = () => {
    if (busy) return
    if (!plus.active) { showPlus('music'); return }
    picker.current?.click()
  }
  const importFile = async (files: File[]) => {
    const source = files[0]
    if (!source || !audio || !store || busy) return
    setBusy(true); setError('')
    try {
      const prepared = await prepareReferenceAudioFile(source)
      const projectId = await audio.ensureProject()
      const stored = await store.importAudio(projectId, prepared.file, prepared.duration)
      // A recording from Files replaces a YouTube link; the two never share one exercise.
      onVideoIdChange(null); onChange('')
      audio.onChange(stored)
      setMissing(false); setYoutubeOpen(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add this recording. Please try again.') }
    finally { setBusy(false) }
  }
  const fileInput = audioEnabled && <input ref={picker} type="file" accept={REFERENCE_AUDIO_ACCEPT} hidden
    onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void importFile(files) }} />
  const problem = error && <p className="routine-reference-error" role="alert">{error}</p>

  if (audio?.value) {
    const length = formatAudioDuration(audio.value.duration)
    return <section className="routine-reference-compact" aria-label="Reference for this item">
      <div className={`reference-pinned${missing ? ' is-missing' : ''}`}>
        <span className="reference-source__icon" aria-hidden><FileAudio /></span>
        <div>
          <strong>{audio.value.name}</strong>
          <small>{missing ? 'This recording is no longer saved. Choose it again.' : busy ? 'Adding recording…' : `${length ? `${length} · ` : ''}Ready when this item starts`}</small>
        </div>
        <button type="button" disabled={busy} onClick={chooseFile}>{missing ? 'Choose' : 'Replace'}</button>
        <button type="button" aria-label="Remove reference" disabled={busy} onClick={() => { audio.onChange(null); setError('') }}><X aria-hidden /></button>
      </div>
      {problem}{fileInput}
    </section>
  }

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

  const youtube = plus.active ? <PracticeReferenceContext.Provider value={{ query: '', autoSearch: false }}>
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
    </PracticeReferenceContext.Provider> : <button type="button" className="routine-setup-action" onClick={() => showPlus('youtube')}>
      <Youtube aria-hidden /><span><strong>Add YouTube reference</strong><small>Search or paste a video link · BestTake Plus</small></span><ChevronRight aria-hidden />
    </button>
  const legacy = value.trim() ? <div className="routine-reference-legacy">
      <small>Search on start: {value}</small>
      <button type="button" onClick={() => onChange('')}>Clear</button>
    </div> : null

  if (!audioEnabled) return <section className="routine-reference-compact" aria-label="Reference for this item">{youtube}{legacy}</section>

  return <section className="routine-reference-compact" aria-label="Reference for this item">
    {youtubeOpen ? <>
      <button type="button" className="reference-source-back" onClick={() => setYoutubeOpen(false)}><ChevronLeft aria-hidden />Other sources</button>
      {youtube}
    </> : <div className="reference-sources">
      <button type="button" className="reference-source" disabled={busy} onClick={chooseFile}>
        <span className="reference-source__icon" aria-hidden><FileAudio /></span>
        <span><strong>Audio file</strong><small>{busy ? 'Adding recording…' : 'MP3, M4A or WAV from Files'}</small></span><ChevronRight aria-hidden />
      </button>
      <button type="button" className="reference-source" disabled={busy} onClick={() => setYoutubeOpen(true)}>
        <span className="reference-source__icon" aria-hidden><Youtube /></span>
        <span><strong>YouTube</strong><small>Search or paste a link</small></span><ChevronRight aria-hidden />
      </button>
    </div>}
    {problem}{legacy}{fileInput}
  </section>
}

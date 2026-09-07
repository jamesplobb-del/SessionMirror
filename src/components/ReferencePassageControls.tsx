import { useEffect, useState } from 'react'
import { Play, Repeat2 } from 'lucide-react'
import { formatPassageTime, parsePassageTime } from '../utils/practicePassages'
import type { useYoutubePracticePassage } from '../hooks/useYoutubePracticePassage'

export default function ReferencePassageControls({ controls }: { controls: ReturnType<typeof useYoutubePracticePassage> }) {
  const { passage, position, duration, ready, error, update, play } = controls
  const [start, setStart] = useState(formatPassageTime(passage.startSeconds))
  const [end, setEnd] = useState(formatPassageTime(passage.endSeconds))
  const [validation, setValidation] = useState('')
  useEffect(() => { setStart(formatPassageTime(passage.startSeconds)); setEnd(formatPassageTime(passage.endSeconds)); setValidation('') }, [passage.startSeconds, passage.endSeconds])
  const save = () => {
    const a = parsePassageTime(start), b = parsePassageTime(end)
    if (a === null || b === null || b - a < .5 || (duration !== null && b > duration)) {
      setValidation('Enter a start and end at least half a second apart, within this recording.'); return
    }
    update({ startSeconds: a, endSeconds: b }); setValidation('')
  }
  const hasPassage = passage.startSeconds !== null && passage.endSeconds !== null
  return <section className="reference-passage-workspace" aria-label="Reference playback">
    <button type="button" className="reference-passage-listen" disabled={!ready} onClick={play}>
      <Play aria-hidden /><span>{hasPassage ? 'Listen to saved passage' : 'Listen to reference'}<small>{hasPassage
        ? `${formatPassageTime(passage.startSeconds)}–${formatPassageTime(passage.endSeconds)}` : 'Save a passage below to return to the same excerpt'}</small></span>
    </button>
    {!ready && <p className="focus-help" role="status">Waiting for the reference player…</p>}
    {error && <p className="focus-error" role="alert">{error}</p>}
    <details className="reference-passage">
    <summary><span>{hasPassage ? 'Edit passage' : 'Choose a passage'}</span><small>{passage.startSeconds !== null && passage.endSeconds !== null
      ? `${formatPassageTime(passage.startSeconds)}–${formatPassageTime(passage.endSeconds)}` : 'Choose the part you’re practicing'}</small></summary>
    <div className="reference-passage__fields">
      <label>From<input inputMode="decimal" placeholder="0:00" value={start} onChange={event => setStart(event.target.value)} /><button type="button" disabled={!ready} onClick={() => setStart(formatPassageTime(position))}>Use current</button></label>
      <label>To<input inputMode="decimal" placeholder="0:30" value={end} onChange={event => setEnd(event.target.value)} /><button type="button" disabled={!ready} onClick={() => setEnd(formatPassageTime(position))}>Use current</button></label>
    </div>
    <div className="reference-passage__actions">
      <button type="button" onClick={save}>Save passage</button>
      <button type="button" disabled={!ready} onClick={play}><Play aria-hidden />Listen</button>
      <button type="button" disabled={passage.endSeconds === null} aria-pressed={passage.loop} onClick={() => update({ loop: !passage.loop })}><Repeat2 aria-hidden />Loop</button>
      <button type="button" onClick={() => { update({ startSeconds: null, endSeconds: null, loop: false }); setStart(''); setEnd(''); setValidation('') }}>Clear</button>
    </div>
    {validation && <p role="alert">{validation}</p>}
    {!ready && <p>Waiting for the reference player. You can still enter and save a passage.</p>}
  </details>
  </section>
}

import { useEffect, useState } from 'react'
import { Play, Pause, ListMusic } from 'lucide-react'
import { timelinePlaybackEngine } from '../practiceTimeline/playback/timelinePlaybackEngine'
import { getTimelineById } from '../practiceTimeline/storage/timelineStorage'
import { toggleRoutineProgram } from '../utils/routineProgram'

export default function RoutineProgramControls({ programId, disabled, onOpen }: { programId: string; disabled: boolean; onOpen?: () => void }) {
  const [state, setState] = useState(() => timelinePlaybackEngine.getState())
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => timelinePlaybackEngine.subscribe(setState), [])
  const program = getTimelineById(programId)
  const playing = state.playing && timelinePlaybackEngine.getTimeline()?.id === programId
  return <div className="routine-program-controls">
    <span><small>PROGRAM</small><strong>{program?.name ?? 'Program unavailable'}</strong></span>
    {program && <>
      <button type="button" disabled={disabled || starting} onClick={() => {
        setStarting(true); setError('')
        void toggleRoutineProgram(programId).then(ok => { if (!ok) setError('Could not start the program. Try again.') })
          .catch(() => setError('Could not start the program. Try again.')).finally(() => setStarting(false))
      }} aria-label={playing ? 'Pause program' : 'Play program'}>{playing ? <Pause aria-hidden /> : <Play aria-hidden />}</button>
      {onOpen && <button type="button" disabled={disabled} onClick={onOpen} aria-label="Open program details"><ListMusic aria-hidden /></button>}
    </>}
    {error && <p role="alert">{error}</p>}
  </div>
}

import { timelinePlaybackEngine } from '../practiceTimeline/playback/timelinePlaybackEngine'
import { getTimelineById } from '../practiceTimeline/storage/timelineStorage'

/** Own only programs launched by the routine; ordinary Program use stays independent. */
let ownedProgramId: string | null = null
export function prepareRoutineProgram(id: string | null | undefined): 'none' | 'ready' | 'missing' {
  if (!id) { exitRoutineProgram(); return 'none' }
  const program = getTimelineById(id)
  if (!program?.sections.length) { exitRoutineProgram(); return 'missing' }
  if (ownedProgramId === id && timelinePlaybackEngine.getTimeline()?.id === id && timelinePlaybackEngine.getState().sessionActive) return 'ready'
  exitRoutineProgram()
  if (!timelinePlaybackEngine.prepareSession(program)) return 'missing'
  ownedProgramId = id
  return 'ready'
}
export function pauseRoutineProgram(): void {
  if (ownedProgramId && timelinePlaybackEngine.getTimeline()?.id === ownedProgramId) timelinePlaybackEngine.pause()
}
export function exitRoutineProgram(): void {
  if (ownedProgramId && timelinePlaybackEngine.getTimeline()?.id === ownedProgramId) timelinePlaybackEngine.exitSession()
  ownedProgramId = null
}
export async function toggleRoutineProgram(id: string): Promise<boolean> {
  if (prepareRoutineProgram(id) !== 'ready') return false
  return timelinePlaybackEngine.togglePlay()
}

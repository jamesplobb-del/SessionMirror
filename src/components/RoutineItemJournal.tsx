import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import FocusedPracticeHistory from './FocusedPracticeHistory'
import { getTakesByProject, uiTakesFromVaultRowsFast } from '../db'
import { resolveTakePlaybackUrl } from '../utils/takeStorage'
import type { ReviewSlot, Take } from '../types'

// Must stay lazy: App keeps ReviewModeOverlay behind its own lazy boundary, and a
// static import here would pull the whole review player back into the App chunk.
const ReviewModeOverlay = lazy(() => import('./ReviewModeOverlay'))

/** A read-only journal: browsing old work never starts a sitting or switches the active project. */
export default function RoutineItemJournal({ projectId, title, onClose, onPlaybackActiveChange }: {
  projectId: string; title: string; onClose: () => void; onPlaybackActiveChange: (playing: boolean) => void
}) {
  const [takes, setTakes] = useState<Take[]>([])
  const [notice, setNotice] = useState('Loading practice history…')
  const [review, setReview] = useState<{ take: Take; reference: Take | null } | null>(null)
  const [slot, setSlot] = useState<ReviewSlot>('challenger')
  const request = useRef(0)
  useEffect(() => {
    const token = ++request.current
    void getTakesByProject(projectId).then(rows => {
      if (request.current !== token) return
      setTakes(uiTakesFromVaultRowsFast(rows)); setNotice('')
    }).catch(() => { if (request.current === token) setNotice('Could not load history. Close and try again.') })
    return () => { request.current++ }
  }, [projectId])
  const open = async (takeId: string, referenceId?: string) => {
    const token = ++request.current
    const take = takes.find(item => item.id === takeId)
    const reference = takes.find(item => item.id === referenceId)
    if (!take) return
    setNotice('Opening recording…')
    try {
      const resolve = async (item: Take) => ({ ...item, videoUrl: await resolveTakePlaybackUrl(item.filePath ?? '', item.videoUrl) })
      const [a, b] = await Promise.all([resolve(take), reference ? resolve(reference) : Promise.resolve(null)])
      if (request.current !== token) return
      setSlot('challenger'); setReview({ take: a, reference: b }); setNotice('')
    } catch { if (request.current === token) setNotice('This recording could not be opened. Its journal entry is still available.') }
  }
  if (!review) return <FocusedPracticeHistory name={title} takes={takes} notice={notice} onClose={onClose}
    onListen={take => void open(take.id)} onCompare={(takeId, referenceId) => void open(takeId, referenceId)} />
  const { take, reference } = review
  return <Suspense fallback={null}><ReviewModeOverlay context="compare" activeSlot={slot} onSlotChange={setSlot}
    vaultTakes={[]} vaultIndex={0} onVaultIndexChange={() => {}}
    benchmarkSrc={reference?.videoUrl ?? null} challengerSrc={take.videoUrl}
    benchmarkTake={reference} challengerTake={take}
    benchmarkFilePath={reference?.filePath} challengerFilePath={take.filePath}
    benchmarkName={reference?.name} challengerName={take.name}
    benchmarkMimeType={reference?.videoMimeType} challengerMimeType={take.videoMimeType}
    benchmarkMediaType={reference?.mediaType} challengerMediaType={take.mediaType}
    benchmarkRecordingOrientation={reference?.recordingOrientation} challengerRecordingOrientation={take.recordingOrientation}
    benchmarkMirror={reference?.mirrorPlayback} challengerMirror={take.mirrorPlayback}
    practiceProjectId={projectId} focusedPractice isOpen onClose={() => { setReview(null); onPlaybackActiveChange(false) }}
    onPlaybackActiveChange={onPlaybackActiveChange} /></Suspense>
}

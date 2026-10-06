import { useActionSheet } from '../context/ActionSheetContext'
import { clearInkStrokes } from './practiceChart/chartInk'
import { prepareRoutineMusicFile } from '../utils/routineMusic'
import { requirePlus } from '../plus/plusAccess'
import { FileMusic, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { sheetMusicAcceptAttribute } from '../multitrack/sheetMusic/sheetMusicUtils'
import {
  deletePracticeChart, hasPracticeChart, practiceChartName, savePracticeChart,
} from '../utils/practiceChartStorage'
import type { RoutineStep } from '../utils/practiceRoutines'
import { blankDesk } from '../utils/practiceRoutines'

interface RoutineMusicSetupProps {
  step: RoutineStep
  onChange: (patch: Partial<RoutineStep>) => void
  /** Creates the practice item this step records into, and returns its id. */
  onCreatePracticeItem: (title: string) => Promise<string>
}

/**
 * Pinning a PDF or photo to a Music item.
 *
 * The file lives on the step's practice folder, not in the shared plan. A
 * student can open a teacher's routine and add their own copy of the part.
 */
export default function RoutineMusicSetup({ step, onChange, onCreatePracticeItem }: RoutineMusicSetupProps) {
  const input = useRef<HTMLInputElement>(null)
  const working = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const { showConfirm } = useActionSheet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  // Whether a file is there is a question for the disk, not for React, so a
  // save or a removal has to say so explicitly.
  const attached = useMemo(
    () => step.projectId !== null && hasPracticeChart(step.projectId),
    // `revision` is the cache key: saving or removing a file is what changes the
    // answer, and neither of them changes the step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, step.projectId],
  )
  const fileName = attached && step.projectId ? practiceChartName(step.projectId) : null
  const desk = step.desk ?? blankDesk('audio')

  const choose = async (file: File) => {
    if (working.current || !requirePlus('music')) return
    working.current = true
    setBusy(true)
    setError('')
    try {
      const prepared = await prepareRoutineMusicFile(file)
      if (!alive.current) return
      if (step.projectId && hasPracticeChart(step.projectId) && !await showConfirm({ title: 'Replace this score?', message: 'Replacing the music will remove its markings. Your recordings and tool settings will stay.', confirmLabel: 'Replace music', destructive: true })) return
      if (!alive.current) return
      // Validate the selected file before creating a practice folder.
      const projectId = step.projectId ?? await onCreatePracticeItem(step.title)
      if (!alive.current) return
      await savePracticeChart(projectId, prepared)
      const inkCleared = clearInkStrokes(projectId)
      if (!alive.current) return
      if (!inkCleared) setError('Music was saved, but its previous markings could not be removed. Please retry replacing this score.')
      onChange({ projectId, desk: { ...desk, mode: 'audio', showMusic: true } })
      setRevision(value => value + 1)
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : 'Could not save this music.')
    } finally {
      working.current = false
      if (alive.current) setBusy(false)
    }
  }

  const remove = async () => {
    if (!step.projectId || working.current) return
    working.current = true
    setBusy(true)
    setError('')
    try {
      if (!await showConfirm({ title: 'Remove this score?', message: 'The music file and all markings on it will be deleted. Recordings stay in this practice item.', confirmLabel: 'Remove music', destructive: true })) return
      if (!alive.current) return
      await deletePracticeChart(step.projectId)
      const inkCleared = clearInkStrokes(step.projectId)
      if (!alive.current) return
      if (!inkCleared) setError('Music was removed, but its previous markings could not be cleared.')
      onChange({ projectId: step.projectId })
      setRevision(value => value + 1)
    } catch {
      if (alive.current) setError('Could not remove this music. Please try again.')
    } finally {
      working.current = false
      if (alive.current) setBusy(false)
    }
  }

  return (
    <section className="routine-reference-compact" aria-label="Music for this item">
      <input
        ref={input}
        type="file"
        hidden
        accept={sheetMusicAcceptAttribute()}
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void choose(file)
        }}
      />
      {attached ? (
        <div className="routine-reference-pinned">
          <FileMusic aria-hidden />
          <div>
            <strong>{fileName ?? 'Music'}</strong>
            <small>Opens with this item</small>
          </div>
          <button type="button" disabled={busy} onClick={() => input.current?.click()}>Change</button>
          <button type="button" aria-label="Remove music" disabled={busy} onClick={() => void remove()}>
            <Trash2 aria-hidden />
          </button>
        </div>
      ) : (
        <button type="button" className="routine-setup-action" disabled={busy} onClick={() => input.current?.click()}>
          <Upload aria-hidden />
          <span>
            <strong>Upload a PDF</strong>
            <small>Or a photo of the part</small>
          </span>
        </button>
      )}
      <p className="practice-menu-note">
        The file is saved in this item's practice folder, next to its takes. Sharing the routine
        does not send the music.
      </p>
      {error && <p className="routine-guide-error" role="alert">{error}</p>}
    </section>
  )
}

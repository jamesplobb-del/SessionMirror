import { FileMusic, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
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
    setBusy(true)
    setError('')
    try {
      // A step with music and no practice item is not a thing: the file has to
      // land in a folder, so the folder is made the moment the file is picked.
      const projectId = step.projectId ?? await onCreatePracticeItem(step.title)
      await savePracticeChart(projectId, file)
      onChange({ projectId, desk: { ...desk, mode: 'audio', showMusic: true } })
      setRevision(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this music.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!step.projectId) return
    setBusy(true)
    setError('')
    try {
      await deletePracticeChart(step.projectId)
      onChange({ projectId: step.projectId })
      setRevision(value => value + 1)
    } catch {
      setError('Could not remove this music. Please try again.')
    } finally {
      setBusy(false)
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

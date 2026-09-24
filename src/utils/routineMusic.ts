import { blankDesk, createStep, MAX_STEP_TITLE, type RoutineStep } from './practiceRoutines'
import { normalizeDeskMetronome } from './deskMetronome'
import { loadMusicScoreSettings, loadMusicSetup } from './musicLibrary'

export function musicExerciseTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, MAX_STEP_TITLE) || 'Music'
}

export function createMusicExercise(fileName: string, projectId: string): RoutineStep {
  return createStep({ title: musicExerciseTitle(fileName), projectId, kind: 'record', topic: 'piece', minutes: 0,
    desk: { ...blankDesk('audio'), showMusic: true } })
}

/** Copy only the requested tools. The destination keeps its score and identity. */
export function copyExerciseTools(source: RoutineStep, target: RoutineStep): RoutineStep {
  if (!source.desk || target.kind === 'game' || target.kind === 'free') return target
  return { ...target, desk: { ...(target.desk ?? blankDesk('audio')),
    showMetronome: source.desk.showMetronome,
    metronome: normalizeDeskMetronome(source.desk.metronome),
    showDrone: source.desk.showDrone, drone: { ...source.desk.drone },
    pitchTrackerEnabled: source.desk.pitchTrackerEnabled,
  } }
}

/** Keep the saved setup intact when the same exercise is reused in another plan. */
export function reuseMusicExercise(step: RoutineStep): RoutineStep {
  const desk = step.projectId ? loadMusicSetup(step.projectId) ?? step.desk : step.desk
  const scoreSettings = step.projectId ? loadMusicScoreSettings(step.projectId) : null
  return createStep({ ...step, kind: 'record', desk: desk ? {
    ...desk, mode: 'audio', showMusic: true,
    metronome: normalizeDeskMetronome(desk.metronome), drone: { ...desk.drone },
  } : { ...blankDesk('audio'), showMusic: true },
  referenceQuery: scoreSettings ? scoreSettings.referenceQuery : step.referenceQuery,
  referenceVideoId: scoreSettings ? scoreSettings.referenceVideoId : step.referenceVideoId,
  programId: scoreSettings ? scoreSettings.programId : step.programId })
}

/** iOS Files can provide an empty MIME type. Validate before creating a folder. */
export async function prepareRoutineMusicFile(file: File): Promise<File> {
  const byExtension: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  const mime = file.type && file.type !== 'application/octet-stream' ? file.type : byExtension[extension]
  if (!Object.values(byExtension).includes(mime)) throw new Error('Choose a PDF, JPEG, PNG, or WebP image.')
  if (!file.size) throw new Error('This file is empty.')
  const normalized = file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified })
  if (mime === 'application/pdf') {
    const { openPdfChart } = await import('../components/practiceChart/chartDocument')
    try {
      const pdf = await openPdfChart(new Uint8Array(await normalized.arrayBuffer()))
      pdf.destroy()
    } catch { throw new Error('This PDF could not be opened. Check that it is readable and not password protected.') }
  } else {
    const url = URL.createObjectURL(normalized)
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onload = () => image.naturalWidth ? resolve() : reject(new Error('This photo could not be opened.'))
        image.onerror = () => reject(new Error('This photo could not be opened.'))
        image.src = url
      })
    } finally { URL.revokeObjectURL(url) }
  }
  return normalized
}

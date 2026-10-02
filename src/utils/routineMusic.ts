import { requirePlus } from '../plus/plusAccess'
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
  referenceAudio: scoreSettings ? scoreSettings.referenceAudio ?? null : step.referenceAudio,
  programId: scoreSettings ? scoreSettings.programId : step.programId })
}

/** iOS Files can provide an empty MIME type. Validate before creating a folder. */
export async function prepareRoutineMusicFile(file: File): Promise<File> {
  if (!requirePlus('music')) throw new Error('Unlock Plus to import music.')
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

/** What the Files picker offers for a reference recording. */
// Named types only: a bare audio/* makes iOS offer Photo Library and Take Video beside Files.
export const REFERENCE_AUDIO_ACCEPT = '.mp3,.m4a,.aac,.wav,.aif,.aiff,.caf,.flac,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/aiff,audio/x-aiff,audio/x-caf,audio/flac'
export const MAX_REFERENCE_AUDIO_BYTES = 150 * 1024 * 1024

const AUDIO_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', wave: 'audio/wav',
  aif: 'audio/aiff', aiff: 'audio/aiff', caf: 'audio/x-caf', flac: 'audio/flac',
}

/**
 * Checks a recording picked in Files before anything is stored: iOS may hand over
 * an empty MIME type, and a file the player cannot open should fail here, with a
 * reason, rather than at the start of an exercise.
 */
export async function prepareReferenceAudioFile(file: File): Promise<{ file: File; duration: number }> {
  if (!requirePlus('music')) throw new Error('Unlock Plus to add a reference recording.')
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  const declared = file.type.startsWith('audio/') && !/ogg|opus|webm/.test(file.type) ? file.type : ''
  const mime = declared || AUDIO_BY_EXTENSION[extension]
  if (!mime) throw new Error('Choose an audio file: MP3, M4A, AAC, WAV, AIFF or FLAC.')
  if (!file.size) throw new Error('This file is empty.')
  if (file.size > MAX_REFERENCE_AUDIO_BYTES) throw new Error('This recording is larger than 150 MB. Choose a shorter or compressed version.')
  const normalized = file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified })
  const url = URL.createObjectURL(normalized)
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const audio = document.createElement('audio')
      const fail = () => reject(new Error('This audio file could not be opened. Try an MP3, M4A or WAV.'))
      const timer = window.setTimeout(fail, 10_000)
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => { window.clearTimeout(timer); resolve(Number.isFinite(audio.duration) ? Math.max(0, Math.round(audio.duration)) : 0) }
      audio.onerror = () => { window.clearTimeout(timer); fail() }
      audio.src = url
    })
    return { file: normalized, duration }
  } finally { URL.revokeObjectURL(url) }
}

/** 3:07 for 187 seconds. */
export function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

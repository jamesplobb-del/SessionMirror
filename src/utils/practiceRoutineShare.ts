import { buildRoutineFile, parseRoutineFile } from '../practiceTimeline/storage/routineFile'
import { getTimelineById, saveTimeline } from '../practiceTimeline/storage/timelineStorage'
import type { PracticeTimeline } from '../practiceTimeline/types'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import {
  createRoutine,
  makeId,
  parseRoutine,
  MAX_ROUTINE_NAME,
  type Routine,
} from './practiceRoutines'
import { storeLibraryRoutine } from './routineLibrary'

/** Shared practice plans carry their exercise checklist and attached metronome
 * programs. Standalone programs still use their own .btroutine file type. */

export const PRACTICE_PLAN_FORMAT = 'besttake.practice-plan'
export const PRACTICE_PLAN_VERSION = 1
export const PRACTICE_PLAN_EXTENSION = 'btplan'
export const PRACTICE_PLAN_UTI = 'com.besttake.app.practice-plan'
export const PRACTICE_PLAN_MIME = 'application/json'

/** Well past any real routine — a bigger file is a wrong file, not a big one. */
export const MAX_PRACTICE_PLAN_BYTES = 5_000_000

export interface PracticePlanEnvelope {
  format: typeof PRACTICE_PLAN_FORMAT
  version: number
  app: string
  appVersion?: string
  exportedAt: number
  routine: Routine
  programs?: Record<string, unknown>
}

export type PracticePlanParseResult =
  | { ok: true; routine: Routine; programs: PracticeTimeline[] }
  | { ok: false; error: string }

function safeFileNameFor(routine: Routine): string {
  const stem =
    routine.name
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40) || 'practice-routine'
  return `${stem}.${PRACTICE_PLAN_EXTENSION}`
}

export function buildPracticePlanFile(routine: Routine, appVersion?: string): string {
  const programs: Record<string, unknown> = {}
  for (const id of new Set(routine.steps.map(step => step.programId).filter((id): id is string => Boolean(id)))) {
    const program = getTimelineById(id)
    if (!program) throw new Error('An attached metronome program is missing. Choose another program before sharing.')
    programs[id] = JSON.parse(buildRoutineFile(program))
  }
  const envelope: PracticePlanEnvelope = {
    format: PRACTICE_PLAN_FORMAT,
    version: PRACTICE_PLAN_VERSION,
    app: 'BestTake',
    appVersion,
    exportedAt: Date.now(),
    routine,
    programs,
  }
  const text = JSON.stringify(envelope, null, 2)
  if (text.length > MAX_PRACTICE_PLAN_BYTES) throw new Error('This routine has too many program details to share in one file.')
  return text
}

/**
 * A routine file is written by one musician and opened by another, so nothing
 * in it can be trusted: it may be hand-edited, truncated in transit, or
 * written by a newer build. `parseRoutine` already clamps every field to what
 * the builder itself can produce, so all this adds is the envelope check and a
 * fresh identity — see below.
 */
export function parsePracticePlanFile(text: string): PracticePlanParseResult {
  if (text.length > MAX_PRACTICE_PLAN_BYTES) {
    return { ok: false, error: 'That file is too large to be a practice routine.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't a BestTake practice routine." }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: "That file isn't a BestTake practice routine." }
  }
  const envelope = parsed as Partial<PracticePlanEnvelope>
  if (envelope.format !== PRACTICE_PLAN_FORMAT) {
    return {
      ok: false,
      error:
        "That file isn't a BestTake practice routine. Metronome program files (.btroutine) open from the Metronome tab instead.",
    }
  }
  if (typeof envelope.version === 'number' && envelope.version > PRACTICE_PLAN_VERSION) {
    return { ok: false, error: 'That routine was made in a newer version of BestTake.' }
  }

  const routine = parseRoutine(envelope.routine)
  if (!routine || routine.steps.length === 0) {
    return { ok: false, error: "That routine couldn't be read." }
  }

  /*
   * A received routine is a new routine, not an edit of the sender's.
   *
   * Keeping their ids would mean a student who imports two versions of the
   * same week silently overwrites the first, and worse, a step would keep the
   * `projectId` of a practice item that only exists on the teacher's phone.
   * Both are re-issued here, so the routine binds to the student's own items
   * on first use exactly as a routine they built would.
   */
  const programs: PracticeTimeline[] = []
  const linkedIds = new Map<string, string>()
  for (const id of new Set(routine.steps.map(step => step.programId).filter((id): id is string => Boolean(id)))) {
    const embedded = envelope.programs && Object.prototype.hasOwnProperty.call(envelope.programs,id) ? envelope.programs[id] : undefined
    if (!embedded) continue // Older shares did not carry programs; never bind to an unrelated local ID.
    const result = parseRoutineFile(JSON.stringify(embedded))
    if (!result.ok) return { ok: false, error: `An attached metronome program could not be read: ${result.error}` }
    programs.push(result.routine)
    linkedIds.set(id,result.routine.id)
  }
  const now = Date.now()
  return {
    ok: true,
    programs,
    routine: {
      ...createRoutine(routine.name, [], routine.instrumentId),
      steps: routine.steps.map((step) => ({
        ...step,
        id: makeId('step'),
        projectId: null,
        programId: step.programId ? linkedIds.get(step.programId) ?? null : null,
      })),
      createdAt: now,
      updatedAt: now,
    },
  }
}

/** Parse, then put it in the library so it is there when the builder opens. */
export function importPracticePlanFromText(text: string): PracticePlanParseResult {
  const result = parsePracticePlanFile(text)
  if (result.ok) {
    const keys = ['besttake:practice-timelines','besttake:practice-timeline-active','besttake:routine-library:v1']
    const previous = keys.map(key => localStorage.getItem(key))
    try {
      for (const program of result.programs) saveTimeline(program)
      // Importing a practice plan must not change the currently selected standalone program.
      if (previous[1] === null) localStorage.removeItem(keys[1]); else localStorage.setItem(keys[1],previous[1])
      storeLibraryRoutine(result.routine)
    } catch {
      keys.forEach((key,index) => { try { const value=previous[index]; if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value) } catch { /* Keep original storage error. */ } })
      return {ok:false,error:'Could not save this routine and its programs. Please check available storage and try again.'}
    }
  }
  return result
}

export function isPracticePlanFileName(name: string): boolean {
  return new RegExp(`\\.${PRACTICE_PLAN_EXTENSION}$`, 'i').test(name.trim())
}

/* ---- Sharing ------------------------------------------------------------ */

const SHARE_CACHE_DIR = 'shared-practice-plans'

export type SharePracticePlanResult = { ok: true } | { ok: false; error: string }

async function ensureShareDirectory(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: SHARE_CACHE_DIR,
      directory: Directory.Cache,
      recursive: true,
    })
  } catch {
    /* Already there — mkdir throws rather than no-ops on an existing path. */
  }
}

async function shareOnDevice(json: string, fileName: string, name: string) {
  await ensureShareDirectory()
  const path = `${SHARE_CACHE_DIR}/${fileName}`
  await Filesystem.writeFile({
    path,
    directory: Directory.Cache,
    data: json,
    encoding: Encoding.UTF8,
  })
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
  await Share.share({
    title: name,
    /* No `text` — on iOS a text item alongside a file makes Mail and Messages
     * inline the string and drop the attachment. */
    files: [uri],
    dialogTitle: 'Share Routine',
  })
}

function downloadInBrowser(json: string, fileName: string): SharePracticePlanResult {
  if (typeof document === 'undefined') {
    return { ok: false, error: 'Sharing is not available here.' }
  }
  const blob = new Blob([json], { type: PRACTICE_PLAN_MIME })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return { ok: true }
}

/**
 * Writes the routine to a file and opens the system share sheet.
 *
 * The web APIs for this (`navigator.share` with files, `<a download>`) are both
 * inert inside the Capacitor WKWebView, so on device the file goes to the cache
 * and reaches the share sheet by URI. The anchor download is kept for
 * `npm run dev` in a desktop browser, where it does work.
 */
export async function sharePracticeRoutine(routine: Routine): Promise<SharePracticePlanResult> {
  if (routine.steps.length === 0) {
    return { ok: false, error: 'Add at least one exercise before sharing this routine.' }
  }
  try {
    const json = buildPracticePlanFile(routine, __APP_VERSION__)
    const fileName = safeFileNameFor(routine)
    if (Capacitor.isNativePlatform()) {
      await shareOnDevice(json, fileName, routine.name.slice(0, MAX_ROUTINE_NAME))
      return { ok: true }
    }
    return downloadInBrowser(json, fileName)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    /* Dismissing the share sheet rejects the promise — that is not a failure. */
    if (/cancel|dismiss|abort/i.test(message)) return { ok: true }
    console.warn('[PracticeRoutine] share failed', error)
    return { ok: false, error: 'Could not share that routine.' }
  }
}

import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { PracticeTimeline } from '../types'
import { buildRoutineFile, ROUTINE_FILE_MIME, routineFileName } from './routineFile'

/**
 * Handing a routine to another musician.
 *
 * The web APIs for this (`navigator.share` with files, `<a download>`) are both
 * inert inside the Capacitor WKWebView, so on device the file is written to the
 * cache and passed to the native share sheet by URI — the same route the take
 * exporter uses. The anchor download is kept for `npm run dev` in a desktop
 * browser, where it does work.
 */

const SHARE_CACHE_DIR = 'shared-routines'

export type ShareRoutineResult = { ok: true } | { ok: false; error: string }

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

async function shareOnDevice(
  json: string,
  fileName: string,
  routineName: string,
): Promise<ShareRoutineResult> {
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
    title: routineName,
    /* No `text` — on iOS a text item alongside a file makes Mail and Messages
     * inline the string and drop the attachment. */
    files: [uri],
    dialogTitle: 'Share Routine',
  })

  return { ok: true }
}

function downloadInBrowser(json: string, fileName: string): ShareRoutineResult {
  if (typeof document === 'undefined') {
    return { ok: false, error: 'Sharing is not available here.' }
  }
  const blob = new Blob([json], { type: ROUTINE_FILE_MIME })
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

/** Writes the routine to a file and opens the system share sheet. */
export async function shareRoutineFile(routine: PracticeTimeline): Promise<ShareRoutineResult> {
  const json = buildRoutineFile(routine, __APP_VERSION__)
  const fileName = routineFileName(routine)

  try {
    if (Capacitor.isNativePlatform()) {
      return await shareOnDevice(json, fileName, routine.name)
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

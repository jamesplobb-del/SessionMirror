import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Encoding, Filesystem } from '@capacitor/filesystem'
import {
  canShowAlertOutsideTree,
  showAlertOutsideTree,
  type AlertOptions,
} from '../../context/ActionSheetContext'
import { isRoutineFileName } from './routineFile'
import { importRoutineFromText } from './timelineStorage'
import type { PracticeTimeline } from '../types'

/**
 * Opening a routine someone sent you.
 *
 * iOS copies a tapped `.btroutine` attachment into the app's Documents/Inbox
 * and hands us the file URL through the standard `appUrlOpen` event, which
 * Capacitor already forwards — AppDelegate falls through to the proxy once the
 * URL isn't a Quick Tuner deep link, so no extra Swift is needed. A cold launch
 * delivers the same URL via `getLaunchUrl()` instead, because the listener is
 * registered after the event has already fired.
 */

export type RoutineOpenEvent =
  | { id: string; status: 'imported'; routine: PracticeTimeline; warnings: string[] }
  | { id: string; status: 'failed'; error: string }

let pending: RoutineOpenEvent | null = null
let initialized = false
const subscribers = new Set<() => void>()
/* iOS can deliver the same launch URL through both getLaunchUrl and the
 * listener; importing twice would leave two copies in the library. */
const handledUrls = new Set<string>()

function emit(event: RoutineOpenEvent): void {
  pending = event
  for (const subscriber of subscribers) subscriber()
  announce(
    event.status === 'imported'
      ? {
          title: 'Routine Added',
          message: `"${event.routine.name}" is in your routines and ready to play.${
            event.warnings.length
              ? `\n\nSome settings were adjusted to fit this version:\n${event.warnings.join('\n')}`
              : ''
          }`,
          tone: 'success',
        }
      : { title: "Couldn't Open Routine", message: event.error, tone: 'error' },
  )
}

/**
 * The practice timeline unmounts whenever its tab isn't showing, so the result
 * is announced here rather than from the view — otherwise a routine opened
 * from Messages would land silently. On a cold launch straight from a file the
 * alert provider mounts with React a moment after this runs, so wait for it.
 */
function announce(options: AlertOptions, attempt = 0): void {
  if (canShowAlertOutsideTree()) {
    showAlertOutsideTree(options)
    return
  }
  if (attempt >= 12) return
  window.setTimeout(() => announce(options, attempt + 1), 300)
}

export function subscribeRoutineFileOpen(callback: () => void): () => void {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

export function getPendingRoutineOpen(): RoutineOpenEvent | null {
  return pending
}

export function clearRoutineOpen(id: string): void {
  if (pending?.id !== id) return
  pending = null
  for (const subscriber of subscribers) subscriber()
}

function looksLikeFileUrl(url: string): boolean {
  return url.startsWith('file://') || url.startsWith('/')
}

/** Strips the query/fragment iOS sometimes appends before checking the name. */
function fileNameFromUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0]
  const segment = withoutQuery.split('/').pop() ?? ''
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

async function readTextFile(url: string): Promise<string> {
  const { data } = await Filesystem.readFile({ path: url, encoding: Encoding.UTF8 })
  /* With an encoding set the plugin returns a string, but the type is a union
   * with Blob for the no-encoding case. */
  return typeof data === 'string' ? data : await data.text()
}

/** Best-effort cleanup so Documents/Inbox doesn't collect every opened file. */
async function discardInboxCopy(url: string): Promise<void> {
  if (!/\/Inbox\//i.test(url)) return
  try {
    await Filesystem.deleteFile({ path: url })
  } catch {
    /* Leaving the copy behind is harmless. */
  }
}

async function handleIncomingUrl(url: string): Promise<void> {
  if (!url || !looksLikeFileUrl(url) || handledUrls.has(url)) return

  const name = fileNameFromUrl(url)
  /* Other file types can reach us through "Open With"; ignore them silently
   * rather than showing an error for a file the user never meant for us. */
  if (!isRoutineFileName(name)) return

  handledUrls.add(url)

  let text: string
  try {
    text = await readTextFile(url)
  } catch (error) {
    console.warn('[PracticeRoutine] could not read opened file', error)
    emit({
      id: `routine-open-${Date.now()}`,
      status: 'failed',
      error: 'Could not open that routine file.',
    })
    return
  }

  const result = importRoutineFromText(text)
  void discardInboxCopy(url)

  emit(
    result.ok
      ? {
          id: `routine-open-${Date.now()}`,
          status: 'imported',
          routine: result.routine,
          warnings: result.warnings,
        }
      : { id: `routine-open-${Date.now()}`, status: 'failed', error: result.error },
  )
}

export async function initializeRoutineFileOpen(): Promise<void> {
  if (initialized || !Capacitor.isNativePlatform()) return
  initialized = true

  try {
    await App.addListener('appUrlOpen', (event) => {
      void handleIncomingUrl(event.url)
    })
  } catch (error) {
    console.warn('[PracticeRoutine] appUrlOpen listener unavailable', error)
  }

  try {
    const launch = await App.getLaunchUrl()
    if (launch?.url) await handleIncomingUrl(launch.url)
  } catch {
    /* No launch URL — the app was opened normally. */
  }
}

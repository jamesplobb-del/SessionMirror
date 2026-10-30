import { readyNaturalTakePreview } from './naturalTakePreview'
import BestTakeAudioPlugin from './audioSessionRoute'
import {
  prepareInlineTakeBoxPlaybackRoute,
  releaseInlineTakeBoxPlaybackRoute,
} from './playbackRouteCoordinator'
import { resolveNativeFileUri } from './takeStorage'
import {
  ensureNativeInlineTakeBoxPlaybackListener,
  isNativeInlineTakeBoxPlaybackAvailable,
  setNativeInlineTakeBoxEndedHandler,
  stopNativeInlineTakeBoxPlayback,
  type InlineTakeBoxWindowRect,
} from './nativeInlineTakeBoxPlayback'

/** Matches camera-mode BestTakeBox inline preview — same AVPlayer + route stack. */
export const AUDIO_MODE_NATIVE_PLAYBACK_OWNER = 'audio-mode-native-playback'

/** Headless 1×1 pt overlay — audio-only takes have no video surface to show. */
const HEADLESS_INLINE_LAYOUT: InlineTakeBoxWindowRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  cornerRadius: 0,
}

export function shouldUseAudioModeNativePlayback(item: {
  filePath: string
  mimeType?: string
}): boolean {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return false
  if (!item.filePath) return false
  const mime = item.mimeType ?? ''
  return mime.startsWith('audio') || item.filePath.endsWith('.m4a')
}

interface PlaybackAttempt {
  generation: number
  routePreparation: Promise<void> | null
  routeHeld: boolean
  routeRelease: Promise<void> | null
}

let playbackGeneration = 0
let currentAttempt: PlaybackAttempt | null = null
let activeAttempt: PlaybackAttempt | null = null
export function isAudioModeNativePlaybackPendingOrActive(): boolean {
  return currentAttempt !== null || activeAttempt !== null
}

let nativePlaybackWork: Promise<unknown> = Promise.resolve()
function enqueuePlayback<T>(operation: () => Promise<T>): Promise<T> {
  const work = nativePlaybackWork.then(operation, operation)
  nativePlaybackWork = work.catch(() => {})
  return work
}

function releaseAttemptRoute(attempt: PlaybackAttempt): Promise<void> {
  if (!attempt.routeRelease) {
    attempt.routeRelease = (async () => {
      await attempt.routePreparation?.catch(() => {})
      if (!attempt.routeHeld) return
      attempt.routeHeld = false
      await releaseInlineTakeBoxPlaybackRoute()
    })()
  }
  return attempt.routeRelease
}

async function stopActiveAttempt(): Promise<void> {
  const attempt = activeAttempt
  if (!attempt) return
  activeAttempt = null
  try {
    await stopNativeInlineTakeBoxPlayback({ notify: false, ownerId: AUDIO_MODE_NATIVE_PLAYBACK_OWNER })
  } finally {
    await releaseAttemptRoute(attempt)
  }
}
let endedHandler: (() => void) | null = null
export function setAudioModeNativePlaybackEndedHandler(handler: (() => void) | null): void {
  endedHandler = handler
}

async function ensureEndedListener(): Promise<void> {
  setNativeInlineTakeBoxEndedHandler(AUDIO_MODE_NATIVE_PLAYBACK_OWNER, () => {
    endedHandler?.()
  })
  await ensureNativeInlineTakeBoxPlaybackListener()
}

export function teardownAudioModeNativePlaybackListener(): void {
  setNativeInlineTakeBoxEndedHandler(AUDIO_MODE_NATIVE_PLAYBACK_OWNER, null)
  endedHandler = null
}

export async function startAudioModeNativePlayback(options: {
  filePath: string
  startTime?: number
  gainDb?: number
}): Promise<{ duration: number } | null> {
  if (!shouldUseAudioModeNativePlayback({ filePath: options.filePath })) return null

  const attempt: PlaybackAttempt = {
    generation: ++playbackGeneration,
    routePreparation: null,
    routeHeld: false,
    routeRelease: null,
  }
  currentAttempt = attempt
  const isCurrent = () => currentAttempt === attempt && attempt.generation === playbackGeneration
  let started = false

  try {
    const fileURL = await resolveNativeFileUri(options.filePath)
    if (!isCurrent()) return null
    if (!fileURL) {
      console.warn('[AudioModeNativePlayback] could not resolve file URI', options.filePath)
      return null
    }

    // Each start owns one lease, including while the native route is preparing.
    attempt.routeHeld = true
    attempt.routePreparation = prepareInlineTakeBoxPlaybackRoute()
    await attempt.routePreparation
    if (!isCurrent()) return null
    await ensureEndedListener()

    const startTime = typeof options.startTime === 'number' && Number.isFinite(options.startTime)
      ? Math.max(0, options.startTime) : 0
    const gainDb = typeof options.gainDb === 'number' && Number.isFinite(options.gainDb)
      ? Math.max(0, Math.min(options.gainDb, 30)) : 0
    const url = await readyNaturalTakePreview(fileURL, 'audio')
    if (!isCurrent()) return null

    const result = await enqueuePlayback(async () => {
      if (!isCurrent()) return null
      await stopActiveAttempt()
      if (!isCurrent()) return null
      const playback = await BestTakeAudioPlugin.startInlineTakeBoxPlayback({
        url,
        ...HEADLESS_INLINE_LAYOUT,
        volume: 1,
        audioOnly: true,
        loudnessGainDb: url === fileURL ? gainDb : 0,
        ownerId: AUDIO_MODE_NATIVE_PLAYBACK_OWNER,
        startTime,
      })
      activeAttempt = attempt
      // A Stop or replacement issued during native startup must settle first.
      if (!isCurrent()) {
        await stopActiveAttempt()
        return null
      }
      return playback
    })
    if (!result || !isCurrent()) return null
    started = true
    const duration = typeof result.duration === 'number' ? result.duration : 0
    console.info('[AudioModeNativePlayback] started inline AVPlayer (camera parity)', {
      duration,
      route: result.route ?? 'inline-take-box',
      systemVolume: result.systemVolume,
      playerVolume: result.playerVolume,
      loudnessGainDb: gainDb,
    })
    return { duration }
  } catch (error) {
    console.warn('[AudioModeNativePlayback] failed to start', error)
    return null
  } finally {
    if (!started) {
      if (currentAttempt === attempt) currentAttempt = null
      await enqueuePlayback(async () => {
        if (activeAttempt === attempt) await stopActiveAttempt()
      })
      await releaseAttemptRoute(attempt)
    }
  }
}

/** Route cleanup after natural end — player already stopped natively. */
export async function releaseAudioModeNativePlaybackRoute(): Promise<void> {
  const attempt = activeAttempt
  if (!attempt) return
  activeAttempt = null
  if (currentAttempt === attempt) currentAttempt = null
  await releaseAttemptRoute(attempt)
}

export async function stopAudioModeNativePlayback(): Promise<void> {
  const generation = ++playbackGeneration
  const attempt = currentAttempt
  currentAttempt = null
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return
  await enqueuePlayback(async () => {
    // A newer request can acquire a lease while this stop waits in the queue.
    if (activeAttempt && activeAttempt.generation < generation) await stopActiveAttempt()
  })
  if (attempt) await releaseAttemptRoute(attempt)
}

import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import {
  ensureMediaMuted,
  prepareInlineMediaElement,
  safePlayMutedMedia,
  type PlaybackAttemptOptions,
} from './mediaPlayback'
import { primePlaybackAudioContextSync, resumePlaybackAudioContext } from './playbackAudioContext'
import { routeTakePlaybackToSpeaker } from './takePlaybackSpeaker'

let autoPlaybackHoldCheck: (() => boolean) | null = null

export function registerTakePlaybackMicHandlers(_handlers: {
  suspendMic: () => void | Promise<void>
  resumeMic: () => void | Promise<void>
}): void {
  // Mic tracks stay live during playback — disabling them makes iOS suspend Web Audio.
}

export function registerAutoPlaybackHold(check: () => boolean): void {
  autoPlaybackHoldCheck = check
}

export function isAutoPlaybackHoldingMicWarmup(): boolean {
  return autoPlaybackHoldCheck?.() ?? false
}

/** Synchronous Web Audio prep — must finish before .play() in the same call stack. */
export function primeTakePlaybackForUserGesture(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  primePlaybackAudioContextSync()

  for (const element of media) {
    if (!element) continue
    prepareInlineMediaElement(element)
    ensureMediaMuted(element)
    routeTakePlaybackToSpeaker(element, element.volume, false)
  }

  resumePitchGraphsForMedia(...media)
  void resumePlaybackAudioContext()
}

/** Prepare playback — async path for programmatic / muted autoplay only. */
export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  primeTakePlaybackForUserGesture(...media)
  await resumePlaybackAudioContext()
}

export function primeTakePlaybackAudioSync(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  primeTakePlaybackForUserGesture(...media)
}

export async function releaseTakePlaybackAudio(): Promise<void> {
  // Speaker routing is handled in AppDelegate — nothing to release here.
}

export interface UserGesturePlaybackCallbacks {
  onPlaying?: () => void
  onFailure?: (error: unknown) => void
}

/**
 * User-gesture playback — call synchronously inside onClick / onPointerUp.
 * Never await before this; set UI state alongside, not via useEffect.
 */
export function playTakeMediaFromUserGesture(
  media: HTMLMediaElement,
  callbacks: UserGesturePlaybackCallbacks = {},
): void {
  primeTakePlaybackForUserGesture(media)
  media.play()
    .then(() => {
      callbacks.onPlaying?.()
    })
    .catch((error: unknown) => {
      console.log(error)
      callbacks.onFailure?.(error)
    })
}

/** Start multiple tracks synchronously from a single user gesture. */
export function playTakeMediaBatchFromUserGesture(
  media: HTMLMediaElement[],
  callbacks: UserGesturePlaybackCallbacks = {},
): void {
  if (media.length === 0) return
  primeTakePlaybackForUserGesture(...media)
  for (const element of media) {
    element.play().catch((error: unknown) => {
      console.log(error)
      callbacks.onFailure?.(error)
    })
  }
}

/**
 * @deprecated Use playTakeMediaFromUserGesture inside click handlers.
 */
export async function playTakeMedia(
  media: HTMLMediaElement,
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  primeTakePlaybackForUserGesture(media)
  return media
    .play()
    .then(() => true)
    .catch((error: unknown) => {
      console.log(error)
      options.onFailure?.(error)
      return false
    })
}

/** Muted programmatic playback — safe after file writes / in useEffect. */
export async function playTakeMediaMuted(
  media: HTMLMediaElement,
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  primeTakePlaybackForUserGesture(media)
  await resumePlaybackAudioContext()
  return safePlayMutedMedia(media, options)
}

export async function playTakeMediaBatch(media: HTMLMediaElement[]): Promise<boolean[]> {
  if (media.length === 0) return []
  primeTakePlaybackForUserGesture(...media)
  await resumePlaybackAudioContext()
  return Promise.all(media.map((element) => safePlayMutedMedia(element)))
}

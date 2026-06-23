import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import {
  prepareInlineMediaElement,
  safePlayMutedMedia,
  type PlaybackAttemptOptions,
} from './mediaPlayback'
import { resumePlaybackAudioContext } from './playbackAudioContext'
import {
  hasTakePlaybackSpeakerRoute,
  routeTakePlaybackToSpeaker,
} from './takePlaybackSpeaker'

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

function primeTakePlayback(
  media: Array<HTMLMediaElement | null | undefined>,
  allowNativeDirect: boolean,
): void {
  const elements = media.filter(
    (element): element is HTMLMediaElement => !!element,
  )
  if (elements.length === 0) return

  for (const element of elements) {
    prepareInlineMediaElement(element)
    routeTakePlaybackToSpeaker(element, element.volume || 1, false, {
      allowNativeDirect,
    })
  }

  const onNativeDirectSingle =
    allowNativeDirect &&
    elements.length === 1 &&
    !hasTakePlaybackSpeakerRoute(elements[0]!)

  if (!onNativeDirectSingle) {
    resumePitchGraphsForMedia(...elements)
  }

  if (elements.some((element) => hasTakePlaybackSpeakerRoute(element))) {
    void resumePlaybackAudioContext()
  }
}

export function primeTakePlaybackForUserGesture(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  const count = media.filter(Boolean).length
  primeTakePlayback(media, count === 1)
}

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

export function playTakeMediaFromUserGesture(
  media: HTMLMediaElement,
  callbacks: UserGesturePlaybackCallbacks = {},
): void {
  primeTakePlaybackForUserGesture(media)

  if (!hasTakePlaybackSpeakerRoute(media)) {
    media.muted = false
    media.volume = 1
  }

  if (
    media.readyState < HTMLMediaElement.HAVE_METADATA &&
    (media.src || media.currentSrc)
  ) {
    try {
      media.load()
    } catch {
      /* ignore */
    }
  }

  void media
    .play()
    .then(() => {
      callbacks.onPlaying?.()
    })
    .catch((error: unknown) => {
      console.log(error)
      callbacks.onFailure?.(error)
    })
}

export function playTakeMediaBatchFromUserGesture(
  media: HTMLMediaElement[],
  callbacks: UserGesturePlaybackCallbacks = {},
): void {
  if (media.length === 0) return
  primeTakePlayback(media, false)
  for (const element of media) {
    element.play().catch((error: unknown) => {
      console.log(error)
      callbacks.onFailure?.(error)
    })
  }
}

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

export async function playTakeMediaMuted(
  media: HTMLMediaElement,
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  primeTakePlayback([media], false)
  await resumePlaybackAudioContext()
  return safePlayMutedMedia(media, options)
}

export async function playTakeMediaAudible(
  media: HTMLMediaElement,
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  primeTakePlayback([media], true)
  if (!hasTakePlaybackSpeakerRoute(media)) {
    media.muted = false
    media.volume = 1
  } else {
    await resumePlaybackAudioContext()
  }
  return media
    .play()
    .then(() => true)
    .catch((error: unknown) => {
      console.log(error)
      options.onFailure?.(error)
      return false
    })
}

export async function playTakeMediaBatch(media: HTMLMediaElement[]): Promise<boolean[]> {
  if (media.length === 0) return []
  primeTakePlayback(media, false)
  await resumePlaybackAudioContext()
  return Promise.all(media.map((element) => safePlayMutedMedia(element)))
}

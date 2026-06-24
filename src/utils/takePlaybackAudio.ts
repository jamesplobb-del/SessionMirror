import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import {
  prepareInlineMediaElement,
  safePlayMutedMedia,
  type PlaybackAttemptOptions,
} from './mediaPlayback'
import { logPlaybackStartRouteDiagnostics } from './playbackRouteDiagnostics'
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

async function primeTakePlayback(
  media: Array<HTMLMediaElement | null | undefined>,
  allowNativeDirect: boolean,
): Promise<void> {
  const elements = media.filter(
    (element): element is HTMLMediaElement => !!element,
  )
  if (elements.length === 0) return

  for (const element of elements) {
    prepareInlineMediaElement(element)
    await routeTakePlaybackToSpeaker(element, element.volume || 1, false, {
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
    await resumePlaybackAudioContext()
  }
}

export async function primeTakePlaybackForUserGesture(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  const count = media.filter(Boolean).length
  await primeTakePlayback(media, count === 1)
}

export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  await primeTakePlaybackForUserGesture(...media)
  await resumePlaybackAudioContext()
}

export function primeTakePlaybackAudioSync(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  void primeTakePlaybackForUserGesture(...media)
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
  void (async () => {
    await primeTakePlaybackForUserGesture(media)

    // Output is via the Web Audio bus; element stays unmuted so iOS keeps decoding.
    media.muted = false
    media.volume = 1
    logPlaybackStartRouteDiagnostics('playTakeMediaFromUserGesture', {
      volume: media.volume,
      muted: media.muted,
    })

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

    try {
      await media.play()
      callbacks.onPlaying?.()
    } catch (error: unknown) {
      console.log(error)
      callbacks.onFailure?.(error)
    }
  })()
}

export function playTakeMediaBatchFromUserGesture(
  media: HTMLMediaElement[],
  callbacks: UserGesturePlaybackCallbacks = {},
): void {
  if (media.length === 0) return
  void (async () => {
    await primeTakePlayback(media, false)
    for (const element of media) {
      try {
        await element.play()
      } catch (error: unknown) {
        console.log(error)
        callbacks.onFailure?.(error)
      }
    }
  })()
}

export async function playTakeMedia(
  media: HTMLMediaElement,
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  await primeTakePlaybackForUserGesture(media)
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
  await primeTakePlayback([media], false)
  await resumePlaybackAudioContext()
  return safePlayMutedMedia(media, options)
}

export async function playTakeMediaAudible(
  media: HTMLMediaElement,
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  await primeTakePlayback([media], false)
  await resumePlaybackAudioContext()

  media.muted = false
  media.volume = 1
  logPlaybackStartRouteDiagnostics('playTakeMediaAudible', {
    volume: media.volume,
    muted: media.muted,
  })

  try {
    await media.play()
    return true
  } catch {
    // iOS can reject unmuted programmatic autoplay — start muted to pass the
    // gate, then unmute immediately so the element keeps decoding (no cutout).
    try {
      media.muted = true
      await media.play()
      media.muted = false
      media.volume = 1
      return true
    } catch (error) {
      console.log(error)
      options.onFailure?.(error)
      return false
    }
  }
}

export async function playTakeMediaBatch(media: HTMLMediaElement[]): Promise<boolean[]> {
  if (media.length === 0) return []
  await primeTakePlayback(media, false)
  await resumePlaybackAudioContext()
  return Promise.all(media.map((element) => safePlayMutedMedia(element)))
}

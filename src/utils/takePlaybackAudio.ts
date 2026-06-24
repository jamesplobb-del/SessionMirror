import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import {
  prepareInlineMediaElement,
  safePlayMutedMedia,
  type PlaybackAttemptOptions,
} from './mediaPlayback'
import { logPlaybackStartRouteDiagnostics } from './playbackRouteDiagnostics'
import { resumePlaybackAudioContext } from './playbackAudioContext'
import { isBluetoothHeadphonePlaybackModeEnabled } from './audioOutputProfile'
import { runBluetoothPlaybackActivation } from './bluetoothPlaybackActivation'
import { enableIosRecordingRoute, enableIosStereoPlaybackRoute } from './iosPlaybackRoute'
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

  if (isBluetoothHeadphonePlaybackModeEnabled()) {
    await runBluetoothPlaybackActivation({
      media: elements[0],
      userVolume: elements[0]?.volume || 1,
      attemptPlay: false,
    })
  } else {
    await enableIosStereoPlaybackRoute()
  }

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

async function playMediaWithOptionalBluetoothActivation(
  media: HTMLMediaElement,
  userVolume = media.volume || 1,
): Promise<boolean> {
  if (isBluetoothHeadphonePlaybackModeEnabled()) {
    return runBluetoothPlaybackActivation({
      media,
      userVolume,
      attemptPlay: true,
    })
  }

  await media.play()
  return true
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
  if (!isBluetoothHeadphonePlaybackModeEnabled()) {
    await enableIosRecordingRoute()
  }
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

    logPlaybackStartRouteDiagnostics('playTakeMediaFromUserGesture', {
      volume: media.volume,
      muted: media.muted,
    })

    try {
      const started = await playMediaWithOptionalBluetoothActivation(media)
      if (started) {
        callbacks.onPlaying?.()
      } else {
        callbacks.onFailure?.(new Error('Bluetooth playback activation failed'))
      }
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
        if (isBluetoothHeadphonePlaybackModeEnabled()) {
          const started = await runBluetoothPlaybackActivation({
            media: element,
            userVolume: element.volume || 1,
            attemptPlay: true,
          })
          if (!started) {
            callbacks.onFailure?.(new Error('Bluetooth playback activation failed'))
          }
        } else {
          await element.play()
        }
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
  try {
    return await playMediaWithOptionalBluetoothActivation(media)
  } catch (error: unknown) {
    console.log(error)
    options.onFailure?.(error)
    return false
  }
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

  logPlaybackStartRouteDiagnostics('playTakeMediaAudible', {
    volume: media.volume,
    muted: media.muted,
  })

  if (isBluetoothHeadphonePlaybackModeEnabled()) {
    const started = await runBluetoothPlaybackActivation({
      media,
      userVolume: media.volume || 1,
      attemptPlay: true,
    })
    if (!started) {
      options.onFailure?.(new Error('Bluetooth playback activation failed'))
    }
    return started
  }

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

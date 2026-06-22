import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import { routeNativeOutputToSpeaker } from '../plugins/audioSession'
import { prepareInlineMediaElement, safePlayMedia } from './mediaPlayback'
import {
  registerPlaybackKeepAlive,
  unregisterPlaybackKeepAlive,
} from './playbackKeepAlive'
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

/** Prepare playback — routes audio through Web Audio so iOS uses the main speaker. */
export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  primePlaybackAudioContextSync()
  await routeNativeOutputToSpeaker()

  for (const element of media) {
    if (!element) continue
    prepareInlineMediaElement(element)
    routeTakePlaybackToSpeaker(element, element.volume, false)
  }

  await resumePlaybackAudioContext()
  resumePitchGraphsForMedia(...media)
}

export function primeTakePlaybackAudioSync(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  void primeTakePlaybackAudio(...media)
}

export async function releaseTakePlaybackAudio(): Promise<void> {
  unregisterPlaybackKeepAlive()
}

export async function playTakeMedia(media: HTMLMediaElement): Promise<boolean> {
  await primeTakePlaybackAudio(media)
  registerPlaybackKeepAlive(media)
  const started = await safePlayMedia(media)
  if (!started) {
    unregisterPlaybackKeepAlive(media)
  }
  return started
}

export async function playTakeMediaBatch(media: HTMLMediaElement[]): Promise<boolean[]> {
  if (media.length === 0) return []
  await primeTakePlaybackAudio(...media)
  for (const element of media) {
    registerPlaybackKeepAlive(element)
  }
  const results = await Promise.all(media.map((element) => safePlayMedia(element)))
  media.forEach((element, index) => {
    if (!results[index]) {
      unregisterPlaybackKeepAlive(element)
    }
  })
  return results
}

import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import { prepareInlineMediaElement, safePlayMedia } from './mediaPlayback'
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
  // Speaker routing is handled in AppDelegate — nothing to release here.
}

export async function playTakeMedia(media: HTMLMediaElement): Promise<boolean> {
  await primeTakePlaybackAudio(media)
  return safePlayMedia(media)
}

export async function playTakeMediaBatch(media: HTMLMediaElement[]): Promise<boolean[]> {
  if (media.length === 0) return []
  await primeTakePlaybackAudio(...media)
  return Promise.all(media.map((element) => safePlayMedia(element)))
}

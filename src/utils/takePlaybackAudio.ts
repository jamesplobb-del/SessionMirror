import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import { prepareInlineMediaElement, safePlayMedia } from './mediaPlayback'
import { primePlaybackAudioContextSync, resumePlaybackAudioContext } from './playbackAudioContext'
import { routeTakePlaybackToSpeaker } from './takePlaybackSpeaker'

type MicHandler = () => void | Promise<void>

let suspendMicInput: MicHandler | null = null
let resumeMicInput: MicHandler | null = null
let autoPlaybackHoldCheck: (() => boolean) | null = null

export function registerTakePlaybackMicHandlers(handlers: {
  suspendMic: MicHandler
  resumeMic: MicHandler
}): void {
  suspendMicInput = handlers.suspendMic
  resumeMicInput = handlers.resumeMic
}

/** Block mic warm-up / re-acquire while hands-free playback is pending or active. */
export function registerAutoPlaybackHold(check: () => boolean): void {
  autoPlaybackHoldCheck = check
}

export function isAutoPlaybackHoldingMicWarmup(): boolean {
  return autoPlaybackHoldCheck?.() ?? false
}

/** Prepare playback — await before calling .play() so mic is released first. */
export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  await suspendMicInput?.()
  primePlaybackAudioContextSync()

  for (const element of media) {
    if (!element) continue
    prepareInlineMediaElement(element)
    routeTakePlaybackToSpeaker(element, element.volume, false)
  }

  await resumePlaybackAudioContext()

  resumePitchGraphsForMedia(...media)
}

/** Sync helper — prefer await primeTakePlaybackAudio() before play. */
export function primeTakePlaybackAudioSync(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  void primeTakePlaybackAudio(...media)
}

/** Restore mic capture after take playback finishes. */
export async function releaseTakePlaybackAudio(): Promise<void> {
  await resumeMicInput?.()
}

/** Prime speaker routing then play — use for all take audio playback. */
export async function playTakeMedia(
  media: HTMLMediaElement,
): Promise<boolean> {
  await primeTakePlaybackAudio(media)
  return safePlayMedia(media)
}

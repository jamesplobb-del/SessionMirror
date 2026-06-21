import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import { prepareInlineMediaElement, safePlayMedia } from './mediaPlayback'
import { primePlaybackAudioContextSync, resumePlaybackAudioContext } from './playbackAudioContext'
import { routeTakePlaybackToSpeaker } from './takePlaybackSpeaker'

let autoPlaybackHoldCheck: (() => boolean) | null = null

export function registerTakePlaybackMicHandlers(_handlers: {
  suspendMic: () => void | Promise<void>
  resumeMic: () => void | Promise<void>
}): void {
  // Mic tracks are no longer disabled during playback (disabling them causes iOS
  // to auto-suspend the AudioContext after ~1 second → silence). No-op kept so
  // all call sites compile without changes.
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
  // Do NOT disable mic tracks here — iOS auto-suspends the AudioContext when
  // there is no active audio input, causing the ~1 second cutout.
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
  // Mic tracks are never disabled during playback — nothing to restore.
  // Kept for call-site compatibility.
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

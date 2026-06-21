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

export function registerAutoPlaybackHold(check: () => boolean): void {
  autoPlaybackHoldCheck = check
}

export function isAutoPlaybackHoldingMicWarmup(): boolean {
  return autoPlaybackHoldCheck?.() ?? false
}

export interface PrimeTakePlaybackOptions {
  /** Keep mic live (studio overdub backing tracks). Default true for take playback. */
  suspendMic?: boolean
}

function isPrimeTakePlaybackOptions(
  value: PrimeTakePlaybackOptions | HTMLMediaElement | null | undefined,
): value is PrimeTakePlaybackOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'suspendMic' in value &&
    !('currentSrc' in value)
  )
}

/** Prepare playback — await before calling .play() so mic is released first. */
export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void>
export async function primeTakePlaybackAudio(
  options: PrimeTakePlaybackOptions,
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void>
export async function primeTakePlaybackAudio(
  optionsOrMedia: PrimeTakePlaybackOptions | HTMLMediaElement | null | undefined,
  ...rest: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  let suspendMic = true
  let media: Array<HTMLMediaElement | null | undefined>

  if (isPrimeTakePlaybackOptions(optionsOrMedia)) {
    suspendMic = optionsOrMedia.suspendMic !== false
    media = rest
  } else {
    media = [optionsOrMedia, ...rest]
  }

  if (suspendMic) {
    await suspendMicInput?.()
  }

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
  await resumeMicInput?.()
}

export async function playTakeMedia(media: HTMLMediaElement): Promise<boolean> {
  await primeTakePlaybackAudio(media)
  return safePlayMedia(media)
}

export async function playTakeMediaBatch(
  media: HTMLMediaElement[],
  options: PrimeTakePlaybackOptions = {},
): Promise<boolean[]> {
  if (media.length === 0) return []
  await primeTakePlaybackAudio(options, ...media)
  return Promise.all(media.map((element) => safePlayMedia(element)))
}

import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import {
  activateNativePlaybackSession,
  activateNativeRecordingSession,
  routeNativeOutputToSpeaker,
} from '../plugins/audioSession'
import { prepareInlineMediaElement, safePlayMedia } from './mediaPlayback'
import { primePlaybackAudioContextSync, resumePlaybackAudioContext } from './playbackAudioContext'
import { routeTakePlaybackToSpeaker } from './takePlaybackSpeaker'

type MicHandler = () => void | Promise<void>

let suspendMicInput: MicHandler | null = null
let resumeMicInput: MicHandler | null = null
let autoPlaybackHoldCheck: (() => boolean) | null = null

/** Ref-count so overlapping players share one native session + mic suspend. */
let playbackSessionHoldCount = 0

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

export type TakePlaybackMode = 'take' | 'overdub'

async function acquirePlaybackSession(mode: TakePlaybackMode): Promise<void> {
  if (playbackSessionHoldCount === 0) {
    if (mode === 'take') {
      await suspendMicInput?.()
      await activateNativePlaybackSession()
    } else {
      await routeNativeOutputToSpeaker()
    }
  }
  playbackSessionHoldCount += 1
}

async function releasePlaybackSession(): Promise<void> {
  if (playbackSessionHoldCount <= 0) return
  playbackSessionHoldCount -= 1
  if (playbackSessionHoldCount > 0) return
  await resumeMicInput?.()
  await activateNativeRecordingSession()
}

function wireMediaElements(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  for (const element of media) {
    if (!element) continue
    prepareInlineMediaElement(element)
    routeTakePlaybackToSpeaker(element, element.volume, false)
  }
}

/** Prepare playback — await before calling .play() so mic is released first. */
export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void>
export async function primeTakePlaybackAudio(
  mode: TakePlaybackMode,
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void>
export async function primeTakePlaybackAudio(
  modeOrMedia: TakePlaybackMode | HTMLMediaElement | null | undefined,
  ...rest: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  let mode: TakePlaybackMode = 'take'
  let media: Array<HTMLMediaElement | null | undefined>

  if (modeOrMedia === 'take' || modeOrMedia === 'overdub') {
    mode = modeOrMedia
    media = rest
  } else {
    media = [modeOrMedia, ...rest]
  }

  await acquirePlaybackSession(mode)
  primePlaybackAudioContextSync()
  wireMediaElements(...media)
  await resumePlaybackAudioContext()
  resumePitchGraphsForMedia(...media)
}

export function primeTakePlaybackAudioSync(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  void primeTakePlaybackAudio(...media)
}

export async function releaseTakePlaybackAudio(): Promise<void> {
  await releasePlaybackSession()
}

export async function playTakeMedia(
  media: HTMLMediaElement,
  mode: TakePlaybackMode = 'take',
): Promise<boolean> {
  await primeTakePlaybackAudio(mode, media)
  return safePlayMedia(media)
}

/** Prime and play multiple elements (studio mix) — one session hold for the batch. */
export async function playTakeMediaBatch(
  media: HTMLMediaElement[],
  mode: TakePlaybackMode = 'take',
): Promise<boolean[]> {
  if (media.length === 0) return []
  await primeTakePlaybackAudio(mode, ...media)
  return Promise.all(media.map((element) => safePlayMedia(element)))
}

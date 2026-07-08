import { logPlaybackGainAuditOnStart } from './playbackGainAudit'
import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import {
  prepareInlineMediaElement,
  safePlayMutedMedia,
  type PlaybackAttemptOptions,
} from './mediaPlayback'
import { resumePlaybackAudioContext } from './playbackAudioContext'
import { engageStereoPlayback, releaseStereoPlayback } from './stereoPlaybackRoute'
import {
  attachPlaybackRouteEndedListener,
  completePlaybackRouteRestore,
  prepareInlineTakeBoxPlaybackRoute,
  preparePlaybackRoute,
  releaseInlineTakeBoxPlaybackRoute,
} from './playbackRouteCoordinator'
import { stabilizeViewportAfterMediaInteraction } from './viewportSync'
import {
  hasTakePlaybackSpeakerRoute,
  routeTakePlaybackToSpeaker,
} from './takePlaybackSpeaker'

let autoPlaybackHoldCheck: (() => boolean) | null = null
let inlineTakePlaybackPreviewHoldCheck: (() => boolean) | null = null

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

/** True while inline take playback should release the live camera preview decoder. */
export function registerInlineTakePlaybackPreviewHold(check: () => boolean): void {
  inlineTakePlaybackPreviewHoldCheck = check
}

export function isInlineTakePlaybackDeferringCameraPreview(): boolean {
  return inlineTakePlaybackPreviewHoldCheck?.() ?? false
}

let takePlaybackStereoHeld = false

function primeTakePlayback(
  media: Array<HTMLMediaElement | null | undefined>,
  allowNativeDirect: boolean,
  options: { engageNativeStereo?: boolean } = {},
): void {
  const elements = media.filter(
    (element): element is HTMLMediaElement => !!element,
  )
  if (elements.length === 0) return

  const engageNativeStereo = options.engageNativeStereo !== false

  if (engageNativeStereo && !takePlaybackStereoHeld) {
    takePlaybackStereoHeld = true
    engageStereoPlayback()
  }

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

export function primeTakePlaybackForPreparedSession(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  const count = media.filter(Boolean).length
  primeTakePlayback(media, count === 1, { engageNativeStereo: false })
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
  if (!takePlaybackStereoHeld) return
  takePlaybackStereoHeld = false
  await releaseStereoPlayback()
  stabilizeViewportAfterMediaInteraction()
}

/** End take playback — restore native route first, then release Web Audio stereo hold. */
export async function finalizeTakePlaybackCleanup(): Promise<void> {
  await completePlaybackRouteRestore()
  await releaseTakePlaybackAudio()
}

/** BestTakeBox inline cleanup — no playbackRouteActive ownership to release. */
export async function finalizeInlineTakeBoxPlaybackCleanup(): Promise<void> {
  await releaseInlineTakeBoxPlaybackRoute()
  await releaseTakePlaybackAudio()
}

/** App background / lifecycle — stop native overlay and release inline holds.
 * notify:true so the owning box resets its UI and releases the stereo hold it
 * owns; an unconditional release here would steal YouTube's hold. */
export async function suspendInlineTakeBoxPlaybackForLifecycle(): Promise<void> {
  const { stopNativeInlineTakeBoxPlayback } = await import('./nativeInlineTakeBoxPlayback')
  await stopNativeInlineTakeBoxPlayback({ notify: true })
  await releaseTakePlaybackAudio()
}

function attachInlineTakeBoxEndedListener(media: HTMLMediaElement): void {
  const onEnd = () => {
    media.removeEventListener('ended', onEnd)
    void finalizeInlineTakeBoxPlaybackCleanup()
  }
  media.addEventListener('ended', onEnd, { once: true })
}

export interface UserGesturePlaybackCallbacks {
  onPlaying?: () => void
  onFailure?: (error: unknown) => void
}

function prepareMediaForAudiblePlayback(media: HTMLMediaElement): void {
  prepareInlineMediaElement(media)
  media.muted = false
  media.volume = 1

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
}

/** Defer one frame so routing/gain is wired after play() resolves. */
function reportTakePlaybackStarted(media: HTMLMediaElement): void {
  window.requestAnimationFrame(() => {
    logPlaybackGainAuditOnStart(media)
  })
}

/** Wire Web Audio gain after playback starts so the user gesture is not blocked. */
function wireTakePlaybackAfterStart(
  media: HTMLMediaElement,
  allowNativeDirect: boolean,
): void {
  primeTakePlayback([media], allowNativeDirect)
}

async function prepareLoudPlaybackBeforeStart(media: HTMLMediaElement): Promise<void> {
  primeTakePlaybackForPreparedSession(media)
  await resumePlaybackAudioContext()
}

export function playTakeMediaFromUserGesture(
  media: HTMLMediaElement,
  callbacks: UserGesturePlaybackCallbacks = {},
): void {
  prepareMediaForAudiblePlayback(media)

  void (async () => {
    try {
      await preparePlaybackRoute({ suspendCamera: false })
      await prepareLoudPlaybackBeforeStart(media)
      await media.play()
      attachPlaybackRouteEndedListener(media)
      wireTakePlaybackAfterStart(media, true)
      reportTakePlaybackStarted(media)
      callbacks.onPlaying?.()
    } catch (error: unknown) {
      console.log(error)
      callbacks.onFailure?.(error)
      await completePlaybackRouteRestore()
    }
  })()
}

/** BestTakeBox web fallback — lightweight speaker route, no playbackRouteActive. */
export function playInlineTakeBoxFromUserGesture(
  media: HTMLMediaElement,
  callbacks: UserGesturePlaybackCallbacks = {},
): void {
  prepareMediaForAudiblePlayback(media)

  void (async () => {
    try {
      await prepareInlineTakeBoxPlaybackRoute()
      await prepareLoudPlaybackBeforeStart(media)
      try {
        await media.play()
        attachInlineTakeBoxEndedListener(media)
        wireTakePlaybackAfterStart(media, true)
        reportTakePlaybackStarted(media)
        callbacks.onPlaying?.()
      } catch {
        // First play() rejection was previously fatal — the button silently
        // reverted to "Play" with no explanation, so the user had to notice
        // and tap again. Mirror playTakeMediaAudible's muted-retry fallback
        // (the same rejection is often transient/autoplay-policy-shaped and
        // resolves once muted) before giving up for real.
        media.muted = true
        await media.play()
        media.muted = false
        media.volume = 1
        attachInlineTakeBoxEndedListener(media)
        wireTakePlaybackAfterStart(media, true)
        reportTakePlaybackStarted(media)
        callbacks.onPlaying?.()
      }
    } catch (error: unknown) {
      console.log(error)
      callbacks.onFailure?.(error)
      await finalizeInlineTakeBoxPlaybackCleanup()
    }
  })()
}

export function playTakeMediaBatchFromUserGesture(
  media: HTMLMediaElement[],
  callbacks: UserGesturePlaybackCallbacks = {},
): void {
  if (media.length === 0) return

  for (const element of media) {
    prepareMediaForAudiblePlayback(element)
  }

  void Promise.all(
    media.map((element) =>
      element.play().catch((error: unknown) => {
        console.log(error)
        callbacks.onFailure?.(error)
        throw error
      }),
    ),
  )
    .then(() => {
      primeTakePlayback(media, false)
      for (const element of media) {
        reportTakePlaybackStarted(element)
      }
    })
    .catch(() => {
      /* onFailure already invoked per element */
    })
}

export async function playTakeMedia(
  media: HTMLMediaElement,
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  prepareMediaForAudiblePlayback(media)
  try {
    await media.play()
    wireTakePlaybackAfterStart(media, true)
    reportTakePlaybackStarted(media)
    return true
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
  primeTakePlayback([media], false)
  await resumePlaybackAudioContext()
  const started = await safePlayMutedMedia(media, options)
  if (started) reportTakePlaybackStarted(media)
  return started
}

export interface PlayTakeMediaAudibleOptions extends PlaybackAttemptOptions {
  /** When playback route was already prepared (e.g. hands-free auto-playback). */
  skipRoutePrep?: boolean
  /**
   * Attach the per-element 'ended' listener that restores the recording route
   * (default true). Multitrack sync passes false: with several clips of
   * different lengths playing together, the FIRST clip to end must not tear
   * down the shared audio session under the still-playing (or still-recording)
   * rest — the sync engine owns route restoration for grouped playback.
   */
  attachEndedRouteRestore?: boolean
}

export async function playTakeMediaAudible(
  media: HTMLMediaElement,
  options: PlayTakeMediaAudibleOptions = {},
): Promise<boolean> {
  prepareMediaForAudiblePlayback(media)

  if (!options.skipRoutePrep) {
    try {
      await preparePlaybackRoute({ suspendCamera: false })
    } catch {
      return false
    }
  }

  await prepareLoudPlaybackBeforeStart(media)

  const attachEnded = options.attachEndedRouteRestore !== false

  try {
    await media.play()
    if (attachEnded) attachPlaybackRouteEndedListener(media)
    wireTakePlaybackAfterStart(media, true)
    reportTakePlaybackStarted(media)
    return true
  } catch {
    try {
      media.muted = true
      await media.play()
      media.muted = false
      media.volume = 1
      if (attachEnded) attachPlaybackRouteEndedListener(media)
      wireTakePlaybackAfterStart(media, true)
      reportTakePlaybackStarted(media)
      return true
    } catch (error) {
      console.error('[Playback] playTakeMediaAudible failed — both play attempts rejected', {
        errorName: error instanceof Error ? error.name : String(error),
        errorMessage: error instanceof Error ? error.message : String(error),
        src: media.src,
        readyState: media.readyState,
        networkState: media.networkState,
        currentTime: media.currentTime,
        duration: media.duration,
        paused: media.paused,
        muted: media.muted,
        volume: media.volume,
        mediaErrorCode: media.error?.code ?? null,
        mediaErrorMessage: media.error?.message ?? null,
      })
      options.onFailure?.(error)
      await completePlaybackRouteRestore()
      return false
    }
  }
}

export async function playTakeMediaBatch(media: HTMLMediaElement[]): Promise<boolean[]> {
  if (media.length === 0) return []
  try {
    await preparePlaybackRoute({ suspendCamera: false })
  } catch {
    return media.map(() => false)
  }

  primeTakePlayback(media, false)
  await resumePlaybackAudioContext()
  return Promise.all(
    media.map(async (element) => {
      const started = await safePlayMutedMedia(element)
      if (started) reportTakePlaybackStarted(element)
      return started
    }),
  )
}

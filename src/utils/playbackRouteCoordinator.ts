import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isHeadphoneOutputActive } from './headphoneOutput'
import { engageStereoPlaybackAsync, releaseStereoPlayback } from './stereoPlaybackRoute'
import {
  getActivePlaybackDiagSession,
  logAudioSessionSnapshot,
  logRouteTransition,
} from './audioPlaybackDiagnostics'

const PLAYBACK_CAMERA_SUSPEND_MS = 300

export interface PreparePlaybackRouteOptions {
  /** When true, suspend camera preview before loud playback (native AVPlayer test paths). */
  suspendCamera?: boolean
}

// Route changes mutate the same AVAudioSession. Complete each transition
// before a new player starts or a previous player restores capture.
let routeOperation: Promise<void> = Promise.resolve()
function enqueueRoute(operation: () => Promise<void>): Promise<void> {
  const result = routeOperation.then(operation, operation)
  routeOperation = result.catch(() => {})
  return result
}

let routeGeneration = 0
let playbackRouteActive = false
let cameraWasSuspendedForPlayback = false
let loudSessionAppliedForPlayback = false
let coexistentSpeakerAppliedForPlayback = false
let restoreInFlight: Promise<void> | null = null
let cameraHandlers: {
  suspend: () => void | Promise<void>
  resume: () => void | Promise<void>
  hasLivePreview?: () => boolean
} | null = null
let playbackRouteListenerInstalled = false

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isIosNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export function registerPlaybackCameraHandlers(handlers: {
  suspend: () => void | Promise<void>
  resume: () => void | Promise<void>
  hasLivePreview?: () => boolean
}): void {
  cameraHandlers = handlers
}

export function isPlaybackRouteHoldActive(): boolean {
  return playbackRouteActive
}

export function clearPlaybackRouteForLifecycle(reason = 'lifecycle'): Promise<void> {
  return enqueueRoute(() => clearPlaybackRouteForLifecycleImpl(reason))
}

async function clearPlaybackRouteForLifecycleImpl(reason: string): Promise<void> {
  if (!isIosNative()) return

  const hadRouteState =
    playbackRouteActive ||
    cameraWasSuspendedForPlayback ||
    loudSessionAppliedForPlayback ||
    coexistentSpeakerAppliedForPlayback ||
    restoreInFlight !== null

  routeGeneration += 1
  playbackRouteActive = false
  cameraWasSuspendedForPlayback = false
  loudSessionAppliedForPlayback = false
  coexistentSpeakerAppliedForPlayback = false
  restoreInFlight = null

  if (!hadRouteState) return

  try {
    await BestTakeAudioPlugin.setPlaybackRouteActive({ active: false })
  } catch (error) {
    console.warn('[PlaybackRoute] failed to clear lifecycle route hold', {
      reason,
      error,
    })
  }
}

async function readNativeCameraSessionState(): Promise<{
  previewActive: boolean
  recordingActive: boolean
}> {
  if (!isIosNative()) {
    return { previewActive: false, recordingActive: false }
  }
  const snapshot = await BestTakeAudioPlugin.getCameraSessionState()
  return {
    previewActive: snapshot.previewActive === true,
    recordingActive: snapshot.recordingActive === true,
  }
}

async function ensureCameraSuspendedForPlayback(): Promise<boolean> {
  const state = await readNativeCameraSessionState()
  const jsPreviewLive = cameraHandlers?.hasLivePreview?.() ?? false
  const needsSuspend = state.previewActive || state.recordingActive || jsPreviewLive

  if (!needsSuspend) {
    return false
  }

  console.log('[PlaybackRoute] suspending camera before playback')
  await cameraHandlers?.suspend()
  await BestTakeAudioPlugin.setCameraSessionState({
    previewActive: false,
    recordingActive: false,
  })
  await delay(PLAYBACK_CAMERA_SUSPEND_MS)
  console.log('[PlaybackRoute] camera suspended')

  const after = await readNativeCameraSessionState()
  if (after.previewActive || after.recordingActive) {
    throw new Error('[PlaybackRoute] camera still active after suspend')
  }
  return true
}

async function applyLoudPlaybackSessionIfSpeaker(options: {
  allowWithActivePreview?: boolean
  failSoft?: boolean
} = {}): Promise<{ applied: boolean; coexistent: boolean }> {
  if (isHeadphoneOutputActive()) return { applied: false, coexistent: false }

  if (!options.allowWithActivePreview) {
    const state = await readNativeCameraSessionState()
    if (state.previewActive || state.recordingActive) {
      throw new Error('[PlaybackRoute] refused loud session while camera active')
    }
  }

  console.log('[PlaybackRoute] applying playback session')
  try {
    const snapshot = await BestTakeAudioPlugin.prepareCameraLikePlaybackSession({
      allowWithActivePreview: options.allowWithActivePreview === true,
    })
    const coexistent = snapshot.playbackRouteStyle === 'coexistent'
    return { applied: true, coexistent }
  } catch (error) {
    if (options.failSoft) {
      console.warn(
        '[PlaybackRoute] loud session with preview failed, continuing on current route',
        error,
      )
      return { applied: false, coexistent: false }
    }
    throw error
  }
}

/**
 * BestTakeBox quick preview — speaker route only. Does NOT set
 * playbackRouteActive, so native camera health checks keep running.
 */
export async function prepareInlineTakeBoxPlaybackRoute(): Promise<void> {
  if (!isIosNative()) return
  await engageStereoPlaybackAsync()
}

export async function releaseInlineTakeBoxPlaybackRoute(): Promise<void> {
  if (!isIosNative()) return
  await releaseStereoPlayback()
}

export function preparePlaybackRoute(options: PreparePlaybackRouteOptions = {}): Promise<void> {
  return enqueueRoute(() => preparePlaybackRouteImpl(options))
}

async function preparePlaybackRouteImpl(options: PreparePlaybackRouteOptions): Promise<void> {
  if (!isIosNative()) return
  if (playbackRouteActive) return

  const suspendCamera = options.suspendCamera === true

  routeGeneration += 1
  playbackRouteActive = true
  cameraWasSuspendedForPlayback = false
  loudSessionAppliedForPlayback = false
  coexistentSpeakerAppliedForPlayback = false
  const diagSessionId = getActivePlaybackDiagSession()
  if (diagSessionId) {
    logRouteTransition(diagSessionId, 'preparePlaybackRoute-start', { suspendCamera })
    void logAudioSessionSnapshot('preparePlaybackRoute-start', diagSessionId)
  }
  try {
    await BestTakeAudioPlugin.setPlaybackRouteActive({ active: true })
    if (suspendCamera) {
      cameraWasSuspendedForPlayback = await ensureCameraSuspendedForPlayback()
      const loud = await applyLoudPlaybackSessionIfSpeaker()
      loudSessionAppliedForPlayback = loud.applied && !loud.coexistent
      coexistentSpeakerAppliedForPlayback = loud.applied && loud.coexistent
    } else {
      const jsVideoPreviewLive = cameraHandlers?.hasLivePreview?.() ?? false
      if (jsVideoPreviewLive) {
        const loud = await applyLoudPlaybackSessionIfSpeaker({
          allowWithActivePreview: true,
          failSoft: true,
        })
        loudSessionAppliedForPlayback = loud.applied && !loud.coexistent
        coexistentSpeakerAppliedForPlayback = loud.applied && loud.coexistent
        if (coexistentSpeakerAppliedForPlayback) {
          console.log(
            '[PlaybackRoute] coexistent speaker route applied — camera preview stays live',
          )
        }
      } else {
        // JS confirms no live video preview. Pass allowWithActivePreview so the
        // native mic capture session (audio mode) does not block loud playback.
        const loud = await applyLoudPlaybackSessionIfSpeaker({
          allowWithActivePreview: true,
          failSoft: true,
        })
        loudSessionAppliedForPlayback = loud.applied && !loud.coexistent
        coexistentSpeakerAppliedForPlayback = loud.applied && loud.coexistent
      }
    }
    if (diagSessionId) {
      logRouteTransition(diagSessionId, 'preparePlaybackRoute-complete', {
        loudSessionAppliedForPlayback,
        coexistentSpeakerAppliedForPlayback,
        cameraWasSuspendedForPlayback,
      })
      void logAudioSessionSnapshot('preparePlaybackRoute-complete', diagSessionId, {
        loudSessionAppliedForPlayback,
      })
    }
  } catch (error) {
    playbackRouteActive = false
    cameraWasSuspendedForPlayback = false
    loudSessionAppliedForPlayback = false
    coexistentSpeakerAppliedForPlayback = false
    await BestTakeAudioPlugin.setPlaybackRouteActive({ active: false }).catch(() => {
      /* ignore */
    })
    throw error
  }
}

/**
 * Re-apply the loud/coexistent playback session even when a route hold is
 * already active. Needed right before a count-in: the pre-warm path sets
 * playbackRouteActive BEFORE the native camera starts, and the capture
 * session's audio configuration then blows away the playback session — after
 * which preparePlaybackRoute() no-ops on the stale flag and the metronome's
 * Web Audio clicks render into a dead session (silent first-take count-in).
 */
export function reassertPlaybackRouteForCountIn(): Promise<void> {
  return enqueueRoute(reassertPlaybackRouteForCountInImpl)
}

async function reassertPlaybackRouteForCountInImpl(): Promise<void> {
  if (!isIosNative()) return

  if (!playbackRouteActive) {
    await preparePlaybackRouteImpl({ suspendCamera: false })
    return
  }

  const loud = await applyLoudPlaybackSessionIfSpeaker({
    allowWithActivePreview: true,
    failSoft: true,
  })
  loudSessionAppliedForPlayback = loud.applied && !loud.coexistent
  coexistentSpeakerAppliedForPlayback = loud.applied && loud.coexistent
}

export function completePlaybackRouteRestore(): Promise<void> {
  return enqueueRoute(completePlaybackRouteRestoreImpl)
}

async function completePlaybackRouteRestoreImpl(): Promise<void> {
  if (!isIosNative()) return
  if (!playbackRouteActive) return

  if (restoreInFlight) {
    await restoreInFlight
    return
  }

  const shouldResumeCamera = cameraWasSuspendedForPlayback
  const shouldRestoreLoudSession = loudSessionAppliedForPlayback
  const shouldRefreshLivePreview = cameraHandlers?.hasLivePreview?.() ?? false

  restoreInFlight = (async () => {
    routeGeneration += 1
    playbackRouteActive = false
    cameraWasSuspendedForPlayback = false
    loudSessionAppliedForPlayback = false
    coexistentSpeakerAppliedForPlayback = false

    console.log('[PlaybackRoute] playback ended')
    if (shouldRestoreLoudSession) {
      console.log('[PlaybackRoute] restoring camera session')
      try {
        await BestTakeAudioPlugin.restoreRecordingRouteAfterPlayback()
      } catch (error) {
        console.warn('[PlaybackRoute] failed to restore recording route', error)
      }
    } else {
      console.log('[PlaybackRoute] skipping route restore — session unchanged')
    }

    try {
      await BestTakeAudioPlugin.setPlaybackRouteActive({ active: false })
    } catch {
      /* ignore */
    }

    if (shouldResumeCamera || shouldRefreshLivePreview) {
      await delay(120)
      await cameraHandlers?.resume()
    }
  })()

  try {
    await restoreInFlight
  } finally {
    restoreInFlight = null
  }
}

export function installPlaybackRouteEndedListener(
  onEnded: () => void | Promise<void>,
): void {
  if (!isIosNative()) return
  if (playbackRouteListenerInstalled) return
  playbackRouteListenerInstalled = true

  void BestTakeAudioPlugin.addListener('playbackRouteEnded', () => {
    const endedGeneration = routeGeneration
    void enqueueRoute(async () => {
      if (!playbackRouteActive || endedGeneration !== routeGeneration) return
      routeGeneration += 1

      const shouldResumeCamera = cameraWasSuspendedForPlayback
      const shouldRefreshLivePreview = cameraHandlers?.hasLivePreview?.() ?? false
      playbackRouteActive = false
      cameraWasSuspendedForPlayback = false
      loudSessionAppliedForPlayback = false
      coexistentSpeakerAppliedForPlayback = false
      restoreInFlight = null

      try {
        await BestTakeAudioPlugin.setPlaybackRouteActive({ active: false })
      } catch {
        /* ignore */
      }

      if (shouldResumeCamera || shouldRefreshLivePreview) {
        await onEnded()
      }
    }).catch(error => console.warn('[PlaybackRoute] end recovery failed', error))
  })
}

export function attachPlaybackRouteEndedListener(media: HTMLMediaElement): void {
  const onEnd = () => {
    media.removeEventListener('ended', onEnd)
    void completePlaybackRouteRestore()
  }

  media.addEventListener('ended', onEnd, { once: true })
}

import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isHeadphoneOutputActive } from './headphoneOutput'
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

let playbackRouteActive = false
let cameraWasSuspendedForPlayback = false
let loudSessionAppliedForPlayback = false
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

export async function clearPlaybackRouteForLifecycle(
  reason = 'lifecycle',
): Promise<void> {
  if (!isIosNative()) return

  const hadRouteState =
    playbackRouteActive ||
    cameraWasSuspendedForPlayback ||
    loudSessionAppliedForPlayback ||
    restoreInFlight !== null

  playbackRouteActive = false
  cameraWasSuspendedForPlayback = false
  loudSessionAppliedForPlayback = false
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
} = {}): Promise<boolean> {
  if (isHeadphoneOutputActive()) return false

  if (!options.allowWithActivePreview) {
    const state = await readNativeCameraSessionState()
    if (state.previewActive || state.recordingActive) {
      throw new Error('[PlaybackRoute] refused loud session while camera active')
    }
  }

  console.log('[PlaybackRoute] applying playback session')
  try {
    await BestTakeAudioPlugin.prepareCameraLikePlaybackSession({
      allowWithActivePreview: options.allowWithActivePreview === true,
    })
    return true
  } catch (error) {
    if (options.failSoft) {
      console.warn(
        '[PlaybackRoute] loud session with preview failed, continuing on current route',
        error,
      )
      return false
    }
    throw error
  }
}

export async function preparePlaybackRoute(
  options: PreparePlaybackRouteOptions = {},
): Promise<void> {
  if (!isIosNative()) return
  if (playbackRouteActive) return

  const suspendCamera = options.suspendCamera === true

  playbackRouteActive = true
  cameraWasSuspendedForPlayback = false
  loudSessionAppliedForPlayback = false
  const diagSessionId = getActivePlaybackDiagSession()
  if (diagSessionId) {
    logRouteTransition(diagSessionId, 'preparePlaybackRoute-start', { suspendCamera })
    void logAudioSessionSnapshot('preparePlaybackRoute-start', diagSessionId)
  }
  await BestTakeAudioPlugin.setPlaybackRouteActive({ active: true })

  try {
    if (suspendCamera) {
      cameraWasSuspendedForPlayback = await ensureCameraSuspendedForPlayback()
      loudSessionAppliedForPlayback = await applyLoudPlaybackSessionIfSpeaker()
    } else {
      const jsVideoPreviewLive = cameraHandlers?.hasLivePreview?.() ?? false
      if (jsVideoPreviewLive) {
        console.log(
          '[PlaybackRoute] skipping loud session — live video preview keeps camera FOV',
        )
      } else {
        loudSessionAppliedForPlayback = await applyLoudPlaybackSessionIfSpeaker({
          failSoft: true,
        })
      }
    }
    if (diagSessionId) {
      logRouteTransition(diagSessionId, 'preparePlaybackRoute-complete', {
        loudSessionAppliedForPlayback,
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
    await BestTakeAudioPlugin.setPlaybackRouteActive({ active: false }).catch(() => {
      /* ignore */
    })
    throw error
  }
}

export async function completePlaybackRouteRestore(): Promise<void> {
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
    playbackRouteActive = false
    cameraWasSuspendedForPlayback = false
    loudSessionAppliedForPlayback = false

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
    void (async () => {
      if (!playbackRouteActive) return

      const shouldResumeCamera = cameraWasSuspendedForPlayback
      const shouldRefreshLivePreview = cameraHandlers?.hasLivePreview?.() ?? false
      playbackRouteActive = false
      cameraWasSuspendedForPlayback = false
      loudSessionAppliedForPlayback = false
      restoreInFlight = null

      try {
        await BestTakeAudioPlugin.setPlaybackRouteActive({ active: false })
      } catch {
        /* ignore */
      }

      if (shouldResumeCamera || shouldRefreshLivePreview) {
        await onEnded()
      }
    })()
  })
}

export function attachPlaybackRouteEndedListener(media: HTMLMediaElement): void {
  const onEnd = () => {
    media.removeEventListener('ended', onEnd)
    void completePlaybackRouteRestore()
  }

  media.addEventListener('ended', onEnd, { once: true })
}

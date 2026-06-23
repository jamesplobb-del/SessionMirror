import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Native bridge to the iOS AVAudioSession route.
 *
 * Stereo playback switches to `.playback`. Capture requires `.playAndRecord`.
 * We track when the native playback route is active and restore only then —
 * never on component mount (WebRTC owns the first hardware lock).
 */
interface AudioSessionPlugin {
  enableStereoPlayback(): Promise<void>
  enableRecordingRoute(): Promise<void>
}

/** Capacitor jsName is `AudioSessionPlugin` (see AudioSessionPlugin.m). */
export const CustomAudioSession = registerPlugin<AudioSessionPlugin>('AudioSessionPlugin')

const isNative = Capacitor.isNativePlatform()

const activeMedia = new WeakSet<HTMLMediaElement>()
const listenerMap = new WeakMap<
  HTMLMediaElement,
  { onPlay: () => void; onPause: () => void; onEnded: () => void }
>()

let playbackCount = 0
let stereoActive = false
/** True after native enableStereoPlayback until enableRecordingRoute succeeds. */
let playbackRouteActive = false
let stereoBlocked = false
let enterTimer: number | null = null
let exitTimer: number | null = null

let onBeforeStereo: (() => void) | null = null
let onAfterRecordingRouteRestore: (() => void) | null = null

export function registerAudioSessionLifecycle(handlers: {
  onBeforeStereo?: () => void
  /** Fires after recording route is restored — refresh the camera stream here. */
  onAfterRecordingRouteRestore?: () => void
}): void {
  onBeforeStereo = handlers.onBeforeStereo ?? null
  onAfterRecordingRouteRestore = handlers.onAfterRecordingRouteRestore ?? null
}

/** Block stereo routing while recording. */
export function setAudioSessionStereoBlocked(blocked: boolean): void {
  stereoBlocked = blocked
  if (blocked) {
    clearStereoTimers()
    playbackCount = 0
    endStereoPlaybackSession()
    void restoreNativeRecordingRoute()
  }
}

async function enableStereoRoute(): Promise<void> {
  if (!isNative || stereoBlocked) return
  try {
    onBeforeStereo?.()
    await CustomAudioSession.enableStereoPlayback()
    playbackRouteActive = true
    stereoActive = true
  } catch (error) {
    console.warn('Failed to switch to stereo playback route', error)
  }
}

function endStereoPlaybackSession(): void {
  clearStereoTimers()
  stereoActive = false
}

async function restoreNativeRecordingRoute(): Promise<boolean> {
  if (!isNative || !playbackRouteActive) {
    endStereoPlaybackSession()
    return false
  }

  endStereoPlaybackSession()
  playbackCount = 0

  try {
    await CustomAudioSession.enableRecordingRoute()
    playbackRouteActive = false
    return true
  } catch (error) {
    console.warn('Failed to restore recording audio route', error)
    return false
  }
}

/** Restore capture route after playback ends or vault closes. */
async function restoreRecordingRouteAfterPlayback(): Promise<void> {
  const restored = await restoreNativeRecordingRoute()
  if (restored) {
    onAfterRecordingRouteRestore?.()
  }
}

/**
 * Call before starting a recording (user gesture). Ensures `.playAndRecord` is
 * active if we previously switched to stereo playback.
 */
export async function prepareRecordingRoute(): Promise<void> {
  if (!isNative) return
  clearStereoTimers()
  playbackCount = 0
  endStereoPlaybackSession()
  if (!playbackRouteActive) return
  await restoreRecordingRouteAfterPlayback()
}

/** Restore when the Take Vault closes and the user returns to the camera HUD. */
export async function restoreRecordingRouteAfterVault(): Promise<void> {
  if (!isNative) {
    onAfterRecordingRouteRestore?.()
    return
  }

  const restored = await restoreNativeRecordingRoute()
  onAfterRecordingRouteRestore?.()
  if (!restored && playbackRouteActive) {
    playbackRouteActive = false
  }
}

function clearStereoTimers(): void {
  if (enterTimer !== null) {
    window.clearTimeout(enterTimer)
    enterTimer = null
  }
  if (exitTimer !== null) {
    window.clearTimeout(exitTimer)
    exitTimer = null
  }
}

function scheduleStereoEnter(): void {
  if (!isNative || stereoBlocked || stereoActive) return
  clearStereoTimers()
  enterTimer = window.setTimeout(() => {
    enterTimer = null
    void enableStereoRoute()
  }, 50)
}

function scheduleStereoExit(): void {
  if (!isNative) return
  clearStereoTimers()
  exitTimer = window.setTimeout(() => {
    exitTimer = null
    if (playbackCount === 0) {
      void restoreRecordingRouteAfterPlayback()
    }
  }, 200)
}

function markMediaPlaying(media: HTMLMediaElement): void {
  if (stereoBlocked) return
  if (activeMedia.has(media)) return
  activeMedia.add(media)
  playbackCount += 1
  if (playbackCount === 1) {
    scheduleStereoEnter()
  }
}

function markMediaStopped(media: HTMLMediaElement): void {
  if (!activeMedia.has(media)) return
  activeMedia.delete(media)
  playbackCount = Math.max(0, playbackCount - 1)
  if (playbackCount === 0) {
    scheduleStereoExit()
  }
}

export function attachMediaAudioSessionRouting(
  media: HTMLMediaElement,
): () => void {
  if (!isNative) {
    return () => {}
  }

  if (listenerMap.has(media)) {
    return () => detachMediaAudioSessionRouting(media)
  }

  const onPlay = () => {
    markMediaPlaying(media)
  }

  const onPause = () => {
    markMediaStopped(media)
  }

  const onEnded = () => {
    markMediaStopped(media)
  }

  media.addEventListener('play', onPlay)
  media.addEventListener('pause', onPause)
  media.addEventListener('ended', onEnded)

  listenerMap.set(media, { onPlay, onPause, onEnded })

  if (!media.paused && !media.ended) {
    markMediaPlaying(media)
  }

  return () => detachMediaAudioSessionRouting(media)
}

export function detachMediaAudioSessionRouting(media: HTMLMediaElement): void {
  const handlers = listenerMap.get(media)
  if (handlers) {
    media.removeEventListener('play', handlers.onPlay)
    media.removeEventListener('pause', handlers.onPause)
    media.removeEventListener('ended', handlers.onEnded)
    listenerMap.delete(media)
  }

  markMediaStopped(media)
}

/** @deprecated */
export async function enableStereoPlaybackRoute(): Promise<void> {
  await enableStereoRoute()
}

/** @deprecated */
export async function enableRecordingAudioRoute(): Promise<void> {
  await restoreRecordingRouteAfterVault()
}

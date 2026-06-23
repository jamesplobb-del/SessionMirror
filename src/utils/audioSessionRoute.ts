import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Native bridge to the iOS AVAudioSession route.
 *
 * `.playAndRecord` (camera/mic live) only outputs the single bottom loudspeaker.
 * `.playback` engages the iPhone's STEREO speakers (bottom + earpiece). We switch
 * to stereo when take media plays, then restore the recording route only when the
 * Take Vault closes (never during camera init — WebRTC owns the first hardware lock).
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
let stereoBlocked = false
let enterTimer: number | null = null
let exitTimer: number | null = null

let onBeforeStereo: (() => void) | null = null
let onAfterVaultRestore: (() => void) | null = null

export function registerAudioSessionLifecycle(handlers: {
  onBeforeStereo?: () => void
  /** Fires after native recording route restore on vault close only. */
  onAfterVaultRestore?: () => void
}): void {
  onBeforeStereo = handlers.onBeforeStereo ?? null
  onAfterVaultRestore = handlers.onAfterVaultRestore ?? null
}

/** Block stereo routing while recording (or other capture-critical states). */
export function setAudioSessionStereoBlocked(blocked: boolean): void {
  stereoBlocked = blocked
  if (blocked && stereoActive) {
    clearStereoTimers()
    playbackCount = 0
    endStereoPlaybackSession()
  }
}

async function enableStereoRoute(): Promise<void> {
  if (!isNative || stereoBlocked) return
  try {
    onBeforeStereo?.()
    await CustomAudioSession.enableStereoPlayback()
    stereoActive = true
  } catch (error) {
    console.warn('Failed to switch to stereo playback route', error)
  }
}

/** Clear stereo playback state without touching the native recording route. */
function endStereoPlaybackSession(): void {
  clearStereoTimers()
  stereoActive = false
}

/**
 * Restore the native recording route — only call when the Take Vault closes and
 * the user returns to an already-running camera screen. Never during camera init.
 */
export async function restoreRecordingRouteAfterVault(): Promise<void> {
  if (!isNative) {
    onAfterVaultRestore?.()
    return
  }

  const needsNativeRestore = stereoActive || playbackCount > 0
  endStereoPlaybackSession()
  playbackCount = 0

  if (needsNativeRestore) {
    try {
      await CustomAudioSession.enableRecordingRoute()
    } catch (error) {
      console.warn('Failed to restore recording audio route', error)
    }
  }

  onAfterVaultRestore?.()
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
      endStereoPlaybackSession()
    }
  }, 150)
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

/**
 * Attach play / pause / ended routing to a media element.
 * Returns a cleanup that removes listeners without restoring the native route.
 */
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

/** @deprecated Use attachMediaAudioSessionRouting via useMediaAudioSessionRouting. */
export async function enableStereoPlaybackRoute(): Promise<void> {
  await enableStereoRoute()
}

/** @deprecated Use restoreRecordingRouteAfterVault on vault close only. */
export async function enableRecordingAudioRoute(): Promise<void> {
  await restoreRecordingRouteAfterVault()
}

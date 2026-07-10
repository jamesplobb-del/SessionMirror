import BestTakeAudioPlugin from './audioSessionRoute'
import {
  prepareInlineTakeBoxPlaybackRoute,
  releaseInlineTakeBoxPlaybackRoute,
} from './playbackRouteCoordinator'
import { resolveNativeFileUri } from './takeStorage'
import {
  isNativeInlineTakeBoxPlaybackAvailable,
  setNativeInlineTakeBoxEndedHandler,
  stopNativeInlineTakeBoxPlayback,
  type InlineTakeBoxWindowRect,
} from './nativeInlineTakeBoxPlayback'

/** Matches camera-mode BestTakeBox inline preview — same AVPlayer + route stack. */
export const AUDIO_MODE_NATIVE_PLAYBACK_OWNER = 'audio-mode-native-playback'

/** Headless 1×1 pt overlay — audio-only takes have no video surface to show. */
const HEADLESS_INLINE_LAYOUT: InlineTakeBoxWindowRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  cornerRadius: 0,
}

export function shouldUseAudioModeNativePlayback(item: {
  filePath: string
  mimeType?: string
}): boolean {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return false
  if (!item.filePath) return false
  const mime = item.mimeType ?? ''
  return mime.startsWith('audio') || item.filePath.endsWith('.m4a')
}

let endedHandler: (() => void) | null = null
let endedListenerInstalled = false
export function setAudioModeNativePlaybackEndedHandler(handler: (() => void) | null): void {
  endedHandler = handler
}

function ensureEndedListener(): void {
  if (endedListenerInstalled) return
  endedListenerInstalled = true
  setNativeInlineTakeBoxEndedHandler(AUDIO_MODE_NATIVE_PLAYBACK_OWNER, () => {
    endedHandler?.()
  })
}

export function teardownAudioModeNativePlaybackListener(): void {
  setNativeInlineTakeBoxEndedHandler(AUDIO_MODE_NATIVE_PLAYBACK_OWNER, null)
  endedListenerInstalled = false
  endedHandler = null
}

export async function startAudioModeNativePlayback(options: {
  filePath: string
  startTime?: number
  gainDb?: number
}): Promise<{ duration: number } | null> {
  if (!shouldUseAudioModeNativePlayback({ filePath: options.filePath })) return null

  const fileURL = await resolveNativeFileUri(options.filePath)
  if (!fileURL) {
    console.warn('[AudioModeNativePlayback] could not resolve file URI', options.filePath)
    return null
  }

  // Camera-mode BestTakeBox uses this lightweight loud-speaker route.
  await prepareInlineTakeBoxPlaybackRoute()
  ensureEndedListener()

  const startTime =
    typeof options.startTime === 'number' && Number.isFinite(options.startTime)
      ? Math.max(0, options.startTime)
      : 0
  const gainDb =
    typeof options.gainDb === 'number' && Number.isFinite(options.gainDb)
      ? Math.max(0, Math.min(options.gainDb, 30))
      : 0

  try {
    const result = await BestTakeAudioPlugin.startInlineTakeBoxPlayback({
      url: fileURL,
      x: HEADLESS_INLINE_LAYOUT.x,
      y: HEADLESS_INLINE_LAYOUT.y,
      width: HEADLESS_INLINE_LAYOUT.width,
      height: HEADLESS_INLINE_LAYOUT.height,
      cornerRadius: HEADLESS_INLINE_LAYOUT.cornerRadius,
      volume: 1,
      audioOnly: true,
      loudnessGainDb: gainDb,
      ownerId: AUDIO_MODE_NATIVE_PLAYBACK_OWNER,
      startTime,
    })
    const duration = typeof result.duration === 'number' ? result.duration : 0
    console.info('[AudioModeNativePlayback] started inline AVPlayer (camera parity)', {
      duration,
      route: result.route ?? 'inline-take-box',
      systemVolume: result.systemVolume,
      playerVolume: result.playerVolume,
      loudnessGainDb: gainDb,
    })
    return { duration }
  } catch (error) {
    console.warn('[AudioModeNativePlayback] failed to start', error)
    await releaseInlineTakeBoxPlaybackRoute()
    return null
  }
}

/** Route cleanup after natural end — player already stopped natively. */
export async function releaseAudioModeNativePlaybackRoute(): Promise<void> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return
  await releaseInlineTakeBoxPlaybackRoute()
}

export async function stopAudioModeNativePlayback(): Promise<void> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return
  try {
    await stopNativeInlineTakeBoxPlayback({
      notify: false,
      ownerId: AUDIO_MODE_NATIVE_PLAYBACK_OWNER,
    })
  } catch {
    /* ignore */
  }
  await releaseInlineTakeBoxPlaybackRoute()
}

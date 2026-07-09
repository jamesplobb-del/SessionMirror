import type { PluginListenerHandle } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import {
  prepareInlineTakeBoxPlaybackRoute,
  releaseInlineTakeBoxPlaybackRoute,
} from './playbackRouteCoordinator'
import { resolveNativeFileUri } from './takeStorage'
import { isNativeInlineTakeBoxPlaybackAvailable } from './nativeInlineTakeBoxPlayback'

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
let endedListenerHandle: PluginListenerHandle | null = null

export function setAudioModeNativePlaybackEndedHandler(handler: (() => void) | null): void {
  endedHandler = handler
}

async function ensureEndedListener(): Promise<void> {
  if (endedListenerInstalled) return
  endedListenerInstalled = true
  endedListenerHandle = await BestTakeAudioPlugin.addListener('playbackRouteEnded', () => {
    endedHandler?.()
  })
}

export async function teardownAudioModeNativePlaybackListener(): Promise<void> {
  if (endedListenerHandle) {
    await endedListenerHandle.remove()
    endedListenerHandle = null
  }
  endedListenerInstalled = false
  endedHandler = null
}

export async function startAudioModeNativePlayback(options: {
  filePath: string
  startTime?: number
}): Promise<{ duration: number } | null> {
  if (!shouldUseAudioModeNativePlayback({ filePath: options.filePath })) return null

  const fileURL = await resolveNativeFileUri(options.filePath)
  if (!fileURL) {
    console.warn('[AudioModeNativePlayback] could not resolve file URI', options.filePath)
    return null
  }

  await prepareInlineTakeBoxPlaybackRoute()
  await ensureEndedListener()

  try {
    const result = await BestTakeAudioPlugin.startNativePlaybackTest({
      url: fileURL,
      startTime: options.startTime,
    })
    const duration = typeof result.duration === 'number' ? result.duration : 0
    return { duration }
  } catch (error) {
    console.warn('[AudioModeNativePlayback] failed to start', error)
    await releaseInlineTakeBoxPlaybackRoute()
    return null
  }
}

export async function stopAudioModeNativePlayback(): Promise<void> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return
  try {
    await BestTakeAudioPlugin.stopNativePlaybackTest()
  } catch {
    /* ignore */
  }
  await releaseInlineTakeBoxPlaybackRoute()
}

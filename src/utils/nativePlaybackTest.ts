import { Capacitor } from '@capacitor/core'
import type { Take } from '../types'
import BestTakeAudioPlugin, { type NativePlaybackTestStartResult } from './audioSessionRoute'
import {
  completePlaybackRouteRestore,
  preparePlaybackRoute,
} from './playbackRouteCoordinator'
import { resolveNativeFileUri } from './takeStorage'

export function isNativePlaybackTestAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/** Play a take via native AVPlayer — bypasses WKWebView / Web Audio (debug A/B only). */
export async function runNativePlaybackTest(
  take: Take,
): Promise<NativePlaybackTestStartResult | null> {
  if (!isNativePlaybackTestAvailable()) {
    console.warn('[NativePlaybackTest] iOS native only')
    return null
  }

  if (!take.filePath) {
    console.warn('[NativePlaybackTest] take has no filePath')
    return null
  }

  const fileURL = await resolveNativeFileUri(take.filePath)
  if (!fileURL) {
    console.warn('[NativePlaybackTest] could not resolve file URI')
    return null
  }

  try {
    await preparePlaybackRoute({ suspendCamera: true })
    const result = await BestTakeAudioPlugin.startNativePlaybackTest({ url: fileURL })

    console.log('[NativePlaybackTest] started')
    console.log('fileURL =', result.fileURL)
    console.log('duration =', result.duration)
    console.log('route =', result.route)
    console.log('systemVolume =', result.systemVolume)
    console.log('playerVolume =', result.playerVolume)

    return result
  } catch (error) {
    console.warn('[NativePlaybackTest] failed', error)
    await completePlaybackRouteRestore()
    return null
  }
}

export async function stopNativePlaybackTest(): Promise<void> {
  if (!isNativePlaybackTestAvailable()) return
  try {
    await BestTakeAudioPlugin.stopNativePlaybackTest()
  } catch {
    /* ignore */
  }
}

import { Capacitor } from '@capacitor/core'
import type { Take } from '../types'
import BestTakeAudioPlugin from './audioSessionRoute'
import { resolveNativeFileUri } from './shareTakeVideo'
import { invalidatePlaybackSrcCache } from './takeStorage'

export async function trimTakeMediaInPlace(
  take: Take,
  startTime: number,
  endTime: number,
): Promise<{ duration: number }> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    throw new Error('Trimming recorded takes is available on iPhone.')
  }

  const url = await resolveNativeFileUri(take)
  if (!url) {
    throw new Error('This take is no longer available on this device.')
  }

  const result = await BestTakeAudioPlugin.trimTakeMedia({
    url,
    startTime,
    endTime,
    mediaType: take.mediaType ?? 'video',
  })
  invalidatePlaybackSrcCache(take.filePath)
  return result
}

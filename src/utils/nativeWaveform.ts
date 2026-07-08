import { Capacitor } from '@capacitor/core'
import type { Take } from '../types'
import BestTakeAudioPlugin from './audioSessionRoute'
import { resolveNativeFileUri } from './shareTakeVideo'

export async function extractNativeWaveformPeaks(
  take: Pick<Take, 'filePath' | 'videoUrl'>,
  barCount: number,
): Promise<number[] | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return null
  }

  const path = await resolveNativeFileUri(take)
  if (!path) return null

  try {
    const result = await BestTakeAudioPlugin.extractWaveformPeaks({ path, barCount })
    return result.peaks.length > 0 ? result.peaks : null
  } catch (error) {
    console.warn('[NativeWaveform] failed', error)
    return null
  }
}

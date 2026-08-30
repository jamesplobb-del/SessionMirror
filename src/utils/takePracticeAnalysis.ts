import { Capacitor } from '@capacitor/core'
import type { PitchSample } from '../types'
import BestTakeAudioPlugin from './audioSessionRoute'

export interface TakePracticeAnalysis {
  performanceStartSeconds?: number
  timelineOffsetMs: number
  pitchSeries: PitchSample[]
}

/** Native offline analysis runs after save and never slows the next record tap. */
export async function analyzeTakeForFocusedPractice(
  filePath: string,
): Promise<TakePracticeAnalysis | null> {
  if (!filePath || !Capacitor.isNativePlatform()) return null
  try {
    const result = await BestTakeAudioPlugin.analyzePracticeTake({ path: filePath })
    return {
      performanceStartSeconds:
        typeof result.performanceStartSeconds === 'number'
          ? result.performanceStartSeconds
          : undefined,
      timelineOffsetMs: Math.max(0, Math.round(result.leadInMs || 0)),
      pitchSeries: Array.isArray(result.pitchSeries)
        ? result.pitchSeries.filter(
            (sample) =>
              Number.isFinite(sample.time) &&
              Number.isFinite(sample.frequencyHz) &&
              sample.frequencyHz > 0,
          )
        : [],
    }
  } catch (error) {
    console.warn('[FocusedPractice] take analysis failed', error)
    return null
  }
}

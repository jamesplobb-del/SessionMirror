import { Capacitor } from '@capacitor/core'
import type { Take } from '../types'
import {
  computeAlignment,
  type AlignmentInput,
  type AlignmentResult,
} from '../multitrack/synchronization/autoAlign'
import BestTakeAudioPlugin from './audioSessionRoute'
import { resolveNativeFileUri } from './shareTakeVideo'

export function isNativeAlignmentAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function computeTakeAlignment(
  take: Take,
  input: Omit<AlignmentInput, 'mediaUrl'>,
): Promise<AlignmentResult> {
  const fallbackInput: AlignmentInput = {
    ...input,
    mediaUrl: take.videoUrl,
  }

  if (!isNativeAlignmentAvailable()) {
    return computeAlignment(fallbackInput)
  }

  const path = await resolveNativeFileUri(take)
  if (!path) {
    return computeAlignment(fallbackInput)
  }

  try {
    const result = await BestTakeAudioPlugin.computeTakeAlignment({
      path,
      bpm: input.bpm,
      countInBeats: input.countInBeats,
      deterministicOffsetMs: input.deterministicOffsetMs,
      searchMs: input.searchMs,
    })
    return {
      refinedOffsetMs: result.refinedOffsetMs,
      residualMs: result.residualMs,
      confidence: result.confidence,
      applied: result.applied,
    }
  } catch (error) {
    console.warn('[NativeAlignment] failed, falling back to JS', error)
    return computeAlignment(fallbackInput)
  }
}

import type { TunerWashTarget } from './pitchUtils'
import { IDLE_TUNER_WASH } from './pitchUtils'

export type RecordWashMode =
  | 'idle'
  | 'hearing'
  | 'recording'
  | 'playing-current'
  | 'playing-best'

const RECORD_RED = '#e6384f'
const RECORD_GOLD = '#f7a600'
const RECORD_BLUE = '#1598ff'

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

/** Whole-screen wash for the Record tab. Energy is live RMS, 0–1. */
export function getRecordWashTarget(
  mode: RecordWashMode,
  energy: number,
): TunerWashTarget {
  const level = clamp01(energy)

  if (mode === 'idle') return IDLE_TUNER_WASH

  if (mode === 'hearing') {
    return {
      hue: RECORD_BLUE,
      strength: 8 + level * 10,
      feather: 6 + level * 4,
      darkStrength: 28 + level * 10,
      center: 12 + level * 18,
      rim: 30 + level * 8,
      rimGlow: 18 + level * 8,
      rimSpread: 38 + level * 12,
    }
  }

  if (mode === 'recording') {
    return {
      hue: RECORD_RED,
      strength: 18 + level * 14,
      feather: 8 + level * 4,
      darkStrength: 40 + level * 14,
      center: 28 + level * 28,
      rim: 36 + level * 16,
      rimGlow: 22 + level * 14,
      rimSpread: 52 + level * 30,
    }
  }

  if (mode === 'playing-best') {
    return {
      hue: RECORD_GOLD,
      strength: 14,
      feather: 8,
      darkStrength: 34,
      center: 22,
      rim: 34,
      rimGlow: 20,
      rimSpread: 46,
    }
  }

  return {
    hue: RECORD_BLUE,
    strength: 12,
    feather: 7,
    darkStrength: 32,
    center: 18,
    rim: 32,
    rimGlow: 18,
    rimSpread: 42,
  }
}

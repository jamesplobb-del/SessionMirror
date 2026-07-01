import type { ScaleRushKey, ScaleRushRange, ScaleRushScale } from './scaleRushMusicLogic'
import type { TunerInstrument } from '../../utils/pitchConfig'

export type ScaleRushPhase = 'setup' | 'playing' | 'gameover'

export interface ScaleRushConfig {
  key: ScaleRushKey
  scale: ScaleRushScale
  range: ScaleRushRange
  tunerInstrument: TunerInstrument
}

export interface ScaleRushState {
  phase: ScaleRushPhase
  config: ScaleRushConfig | null
  /** Index into the scale sequence — also drives course row labels. */
  sequenceStep: number
  targetPitchClass: number
  score: number
  streak: number
  bestStreak: number
  hearts: number
  correctCount: number
  missCount: number
  bestScore: number
  advanceToken: number
  missToken: number
  startedAtMs: number | null
}

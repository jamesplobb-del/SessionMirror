import type { ScaleRushKey } from './scaleRushMusicLogic'
import type { TunerInstrument } from '../../utils/pitchConfig'

export type ScaleRushPhase = 'setup' | 'playing' | 'gameover'

export interface ScaleRushConfig {
  key: ScaleRushKey
  tunerInstrument: TunerInstrument
}

export interface ScaleRushState {
  phase: ScaleRushPhase
  config: ScaleRushConfig | null
  sequenceStep: number
  targetPitchClass: number
  score: number
  streak: number
  bestStreak: number
  hearts: number
  correctCount: number
  missCount: number
  bestScore: number
  /** Increments on each successful jump — drives runner animation. */
  advanceToken: number
  /** Brief miss feedback for runner shake. */
  missToken: number
  startedAtMs: number | null
}

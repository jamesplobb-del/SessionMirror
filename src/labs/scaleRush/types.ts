import type {
  ScaleRushKey,
  ScaleRushRange,
  ScaleRushScale,
  ScaleRushTransposition,
} from './scaleRushMusicLogic'
import type { TunerInstrument } from '../../utils/pitchConfig'

export type ScaleRushPhase = 'setup' | 'playing' | 'gameover'

export interface ScaleRushConfig {
  key: ScaleRushKey
  scale: ScaleRushScale
  range: ScaleRushRange
  tunerInstrument: TunerInstrument
  /** Written-pitch transposition so players see fingerings, not concert pitch. */
  transposition: ScaleRushTransposition
  /** When true, note must be within ±15¢. When false, pitch-class match is enough. */
  pitchAccuracyStrict: boolean
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
  advanceToken: number
  missToken: number
  startedAtMs: number | null
}

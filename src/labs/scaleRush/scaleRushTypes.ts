import type {
  ScaleRushKey,
  ScaleRushRange,
  ScaleRushScaleMode,
  ScaleRushTransposition,
} from './scaleRushMusicLogic'
import type { TunerInstrument } from '../../utils/pitchConfig'

export type ScaleRushPhase = 'setup' | 'playing' | 'gameover'

export type ScaleRushFeedback = 'perfect' | 'good' | 'wrong' | 'timeout' | null

export interface ScaleRushConfig {
  key: ScaleRushKey
  scaleMode: ScaleRushScaleMode
  range: ScaleRushRange
  endless: boolean
  tunerInstrument: TunerInstrument
  transposition: ScaleRushTransposition
  /** v0.1 default: pitch-class match only (octave ignored). */
  pitchAccuracyStrict: boolean
  /** Set when a run starts — drives post-scale pattern randomization. */
  sessionSeed?: number
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
  feedback: ScaleRushFeedback
  feedbackToken: number
  startedAtMs: number | null
}

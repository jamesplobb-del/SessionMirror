import type {
  ScaleRushKey,
  ScaleRushRange,
  ScaleRushScale,
  ScaleRushTransposition,
} from './scaleRushMusicLogic'
import type { TunerInstrument } from '../../utils/pitchConfig'

export type ScaleRushPhase = 'setup' | 'playing' | 'gameover'

export type ScaleRushFeedback = 'perfect' | 'good' | 'wrong' | 'timeout' | null

export interface ScaleRushConfig {
  key: ScaleRushKey
  scale: ScaleRushScale
  range: ScaleRushRange
  tunerInstrument: TunerInstrument
  transposition: ScaleRushTransposition
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
  feedback: ScaleRushFeedback
  feedbackToken: number
  startedAtMs: number | null
}

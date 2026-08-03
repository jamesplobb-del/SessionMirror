import type {
  ScaleRushKey,
  ScaleRushRange,
  ScaleRushScaleMode,
  ScaleRushTransposition,
} from './scaleRushMusicLogic'
import type { TunerInstrument } from '../../utils/pitchConfig'

export type ScaleRushPhase = 'setup' | 'playing' | 'paused' | 'gameover'

export type ScaleRushPlayerModelId =
  | 'trumpeter'
  | 'cat'
  | 'robot'
  | 'bird'
  | 'fox'
  | 'astronaut'

export type ScaleRushFeedback = 'perfect' | 'good' | 'wrong' | 'timeout' | null

export interface ScaleRushConfig {
  key: ScaleRushKey
  scaleMode: ScaleRushScaleMode
  range: ScaleRushRange
  endless: boolean
  tunerInstrument: TunerInstrument
  transposition: ScaleRushTransposition
  playerModel: ScaleRushPlayerModelId
  /** When disabled, pitch-class matching accepts any octave and does not score cents. */
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
  endedAtMs: number | null
  pausedAtMs: number | null
  pausedDurationMs: number
}

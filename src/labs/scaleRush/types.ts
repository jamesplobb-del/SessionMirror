import type { GamePhase } from '../engine/types'
import type { KeyRoot, ScaleType } from '../musicTheory/scales'

export type ScaleRushMode = 'practice' | 'survival'

export const SCALE_RUSH_MODE_LABELS: Record<ScaleRushMode, string> = {
  practice: 'Practice',
  survival: 'Survival',
}

/** Lives per mode — Hardcore (1 life) can be added here later. */
export const SCALE_RUSH_LIVES: Record<ScaleRushMode, number | null> = {
  practice: null,
  survival: 3,
}

export interface ScaleRushConfig {
  key: KeyRoot
  scaleType: ScaleType
  mode: ScaleRushMode
}

export interface ScaleRushRuntimeState {
  phase: GamePhase
  config: ScaleRushConfig | null
  targetMidi: number | null
  notePool: number[]
  lives: number
  scoring: import('../engine/scoring').ScoringState
  startedAtMs: number | null
  endedAtMs: number | null
}

export type ScaleRushAction =
  | { type: 'CONFIGURE'; config: ScaleRushConfig }
  | { type: 'START_WITH_CONFIG'; config: ScaleRushConfig }
  | { type: 'START' }
  | { type: 'CORRECT_NOTE' }
  | { type: 'WRONG_NOTE' }
  | { type: 'RESTART' }
  | { type: 'BACK_TO_SETUP' }

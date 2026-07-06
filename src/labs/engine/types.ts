import type { PitchReadout } from '../../utils/pitchUtils'

/** Lifecycle phases shared across Practice Arcade games. */
export type GamePhase = 'setup' | 'playing' | 'gameover'

/** Base statistics tracked during play and shown at game over. */
export interface GameStatistics {
  score: number
  highestCombo: number
  correctNotes: number
  incorrectNotes: number
  startedAtMs: number | null
  endedAtMs: number | null
}

export function createInitialStatistics(): GameStatistics {
  return {
    score: 0,
    highestCombo: 0,
    correctNotes: 0,
    incorrectNotes: 0,
    startedAtMs: null,
    endedAtMs: null,
  }
}

/** Pitch input adapter — decouples gameplay from the live pitch hook. */
export interface PitchInputSnapshot {
  readout: PitchReadout
  hasSignal: boolean
}

export interface PitchMatchResult {
  kind: 'match' | 'wrong' | 'none'
}

/** Future expansion hooks (not implemented in v0.1). */
export interface GameSessionMeta {
  modeId: string
  dailyChallengeId?: string
  leaderboardId?: string
  xpMultiplier?: number
}

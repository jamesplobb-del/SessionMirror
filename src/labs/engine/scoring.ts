import type { GameStatistics } from './types'

export interface ScoringState {
  score: number
  combo: number
  highestCombo: number
  correctNotes: number
  incorrectNotes: number
  consecutiveWrong: number
}

export function createScoringState(): ScoringState {
  return {
    score: 0,
    combo: 0,
    highestCombo: 0,
    correctNotes: 0,
    incorrectNotes: 0,
    consecutiveWrong: 0,
  }
}

export function applyCorrectNote(state: ScoringState): ScoringState {
  const combo = state.combo + 1
  return {
    ...state,
    score: state.score + 1,
    combo,
    highestCombo: Math.max(state.highestCombo, combo),
    correctNotes: state.correctNotes + 1,
    consecutiveWrong: 0,
  }
}

export function applyIncorrectNote(
  state: ScoringState,
  comboResetThreshold = 3,
): ScoringState {
  const consecutiveWrong = state.consecutiveWrong + 1
  return {
    ...state,
    combo: consecutiveWrong >= comboResetThreshold ? 0 : state.combo,
    incorrectNotes: state.incorrectNotes + 1,
    consecutiveWrong,
  }
}

export function scoringToStatistics(
  scoring: ScoringState,
  startedAtMs: number | null,
  endedAtMs: number | null,
): GameStatistics {
  return {
    score: scoring.score,
    highestCombo: scoring.highestCombo,
    correctNotes: scoring.correctNotes,
    incorrectNotes: scoring.incorrectNotes,
    startedAtMs,
    endedAtMs,
  }
}

export function computeAccuracy(correct: number, incorrect: number): number {
  const total = correct + incorrect
  if (total === 0) return 100
  return Math.round((correct / total) * 1000) / 10
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

import type { TunerInstrument } from '../../utils/pitchConfig'
import type { TunerTranspositionId } from '../../utils/tunerTransposition'

export type BalancePhase =
  | 'setup'
  | 'countIn'
  | 'waitingForPitch'
  | 'pitchLock'
  | 'active'
  | 'goalReached'
  | 'resting'
  | 'noteResults'
  | 'routineResults'
  | 'paused'
  | 'stopped'
  | 'error'

export type BalanceRoutineType = 'single' | 'scale' | 'custom'
export type BalanceScaleType =
  | 'major'
  | 'naturalMinor'
  | 'harmonicMinor'
  | 'melodicMinor'
  | 'chromatic'
export type BalanceScaleDirection = 'ascending' | 'descending' | 'upDown'
export type BalanceGoalMode = 'fixed' | 'personalBest'
export type BalanceTolerancePreset = 'beginner' | 'standard' | 'precision' | 'custom'
export type BalanceRestDuration = 'matchGoal' | 5 | 10 | 'manual'

export interface BalanceInstrument {
  id: string
  name: string
  transposition: TunerTranspositionId
  tunerInstrument: TunerInstrument
  clef: 'treble' | 'alto' | 'bass'
  minWrittenMidi: number
  maxWrittenMidi: number
}

export interface BalanceRoutineNote {
  id: string
  writtenMidi: number
}

export interface BalanceCustomRoutine {
  id: string
  name: string
  notes: BalanceRoutineNote[]
  createdAt: number
  updatedAt: number
}

export interface BalanceSingleRoutineSettings {
  writtenMidi: number
  repetitions: number
}

export interface BalanceScaleRoutineSettings {
  rootWrittenMidi: number
  scaleType: BalanceScaleType
  direction: BalanceScaleDirection
  octaveRange: 1 | 2
  repetitions: number
}

export interface BalanceSoundRestSettings {
  referencePitch: boolean
  continuousDrone: boolean
  volume: number
  countIn: boolean
  restDuration: BalanceRestDuration
  autoAdvance: boolean
}

export interface BalanceSettings {
  routineType: BalanceRoutineType
  instrumentId: string
  single: BalanceSingleRoutineSettings
  scale: BalanceScaleRoutineSettings
  selectedCustomRoutineId: string | null
  goalMode: BalanceGoalMode
  goalSeconds: 5 | 8 | 10 | 15
  tolerancePreset: BalanceTolerancePreset
  customToleranceCents: number
  soundRest: BalanceSoundRestSettings
}

export interface BalanceTarget {
  id: string
  sequenceIndex: number
  instrumentId: string
  writtenMidi: number
  concertMidi: number
  writtenLabel: string
  concertLabel: string
}

export interface BalancePitchSample {
  timestamp: number
  centsFromTarget: number
}

export type BalanceDriftDirection = 'flatward' | 'sharpward' | null

export interface BalanceNoteResult {
  target: BalanceTarget
  toleranceCents: number
  totalConfidentMs: number
  balancedMs: number
  centeredPercent: number
  longestCenteredMs: number
  signedAverageCents: number
  averageAbsoluteCents: number
  sharpestCents: number
  flattestCents: number
  driftDirection: BalanceDriftDirection
  goalReached: boolean
  completedAt: number
}

export interface BalanceRoutineResult {
  id: string
  routineName: string
  startedAt: number
  completedAt: number
  noteResults: BalanceNoteResult[]
  notesCompleted: number
  totalBalancedMs: number
  totalConfidentMs: number
  centeredPercent: number
  completed: boolean
}

export interface BalanceVisualSnapshot {
  cents: number
  progress: number
  speed: number
  balancedMs: number
  confidentMs: number
  pitchPresent: boolean
}

export interface BalanceState {
  phase: BalancePhase
  resumePhase: Exclude<BalancePhase, 'paused'> | null
  settings: BalanceSettings
  targets: BalanceTarget[]
  targetIndex: number
  noteResults: BalanceNoteResult[]
  currentResult: BalanceNoteResult | null
  startedAt: number | null
  restEndsAt: number | null
  errorMessage: string | null
  bestBalancedMs: number
}

export interface BalanceStoredPersonalBest {
  key: string
  balancedMs: number
  updatedAt: number
}

export interface BalanceStoredDataV1 {
  version: 1
  settings: BalanceSettings
  customRoutines: BalanceCustomRoutine[]
  personalBests: Record<string, BalanceStoredPersonalBest>
  routineSummaries: BalanceRoutineResult[]
}

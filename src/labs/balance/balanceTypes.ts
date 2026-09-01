import type { TunerInstrument } from '../../utils/pitchConfig'
import type { TunerTranspositionId } from '../../utils/tunerTransposition'
import type { BalanceCharacterId } from './balanceCharacters'

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
  /** Grouping for the instrument picker. */
  family: string
  minWrittenMidi: number
  maxWrittenMidi: number
  /**
   * The note a method book starts this instrument on. Sky Trail levels are
   * written as semitone offsets from here, so one ladder fits every player
   * instead of hard-coding a pitch a tuba could never reach.
   */
  homeWrittenMidi: number
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
  characterId: BalanceCharacterId
  single: BalanceSingleRoutineSettings
  scale: BalanceScaleRoutineSettings
  selectedCustomRoutineId: string | null
  goalMode: BalanceGoalMode
  /** Seconds of centered time that completes one note. Levels use values off
   * the setup slider's own list, so this is a plain number. */
  goalSeconds: number
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
  routineType: BalanceRoutineType
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

export type BalanceLaunchKind = 'quick' | 'level' | 'daily'

/**
 * What a single run is: the quick-play settings, one Sky Trail level, or the
 * day's challenge. Everything the run needs that is *not* a player preference
 * travels here, so the persisted settings are never overwritten by a level.
 */
export interface BalanceLaunch {
  kind: BalanceLaunchKind
  /** Level id, or the daily's YYYY-MM-DD key. Null for quick play. */
  id: string | null
  title: string
  subtitle: string
  /** Written pitches for the run. Null means "build from settings". */
  writtenMidi: number[] | null
  goalSeconds: number | null
  toleranceCents: number | null
}

export interface BalanceLevelProgress {
  stars: number
  bestCenteredPercent: number
  bestBalancedMs: number
  clearedAt: number
}

export interface BalanceDailyProgress {
  /** YYYY-MM-DD of the most recently completed challenge. */
  lastCompletedDate: string | null
  streak: number
  longestStreak: number
  totalCompleted: number
}

export interface BalanceStoredPersonalBest {
  key: string
  balancedMs: number
  updatedAt: number
}

export type BalanceTrophyId =
  | 'first-crossing'
  | 'long-haul'
  | 'rope-time'
  | 'scale-walker'
  | 'center-stage'
  | 'precision-pilot'
  | 'made-to-measure'

export interface BalanceStoredTrophy {
  id: BalanceTrophyId
  unlockedAt: number
}

export interface BalanceStoredDataV3 {
  version: 3
  settings: BalanceSettings
  customRoutines: BalanceCustomRoutine[]
  personalBests: Record<string, BalanceStoredPersonalBest>
  routineSummaries: BalanceRoutineResult[]
  trophies: Partial<Record<BalanceTrophyId, BalanceStoredTrophy>>
  unlockedCharacterIds: BalanceCharacterId[]
  /** Star record per Sky Trail level id. */
  levels: Record<string, BalanceLevelProgress>
  daily: BalanceDailyProgress
}

/** @deprecated kept as the migration source name. */
export type BalanceStoredDataV2 = BalanceStoredDataV3

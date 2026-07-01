import { pickWeightedScaleNote } from '../engine/noteGenerator'
import { applyCorrectNote, applyIncorrectNote, createScoringState } from '../engine/scoring'
import { buildScaleMidiPool } from '../musicTheory/scales'
import {
  SCALE_RUSH_LIVES,
  type ScaleRushAction,
  type ScaleRushConfig,
  type ScaleRushRuntimeState,
} from './types'

export function createInitialScaleRushState(): ScaleRushRuntimeState {
  return {
    phase: 'setup',
    config: null,
    targetMidi: null,
    notePool: [],
    lives: 0,
    scoring: createScoringState(),
    startedAtMs: null,
    endedAtMs: null,
  }
}

function initialLivesForConfig(config: ScaleRushConfig): number {
  return SCALE_RUSH_LIVES[config.mode] ?? 0
}

function nextTarget(pool: number[], previousMidi: number | null): number {
  return pickWeightedScaleNote(pool, previousMidi)
}

export function scaleRushReducer(
  state: ScaleRushRuntimeState,
  action: ScaleRushAction,
): ScaleRushRuntimeState {
  switch (action.type) {
    case 'CONFIGURE':
      return {
        ...createInitialScaleRushState(),
        phase: 'setup',
        config: action.config,
      }

    case 'START_WITH_CONFIG':
      return scaleRushReducer(
        { ...createInitialScaleRushState(), config: action.config },
        { type: 'START' },
      )

    case 'START': {
      if (!state.config) return state
      const notePool = buildScaleMidiPool(state.config.key, state.config.scaleType)
      const targetMidi = nextTarget(notePool, null)
      return {
        ...state,
        phase: 'playing',
        notePool,
        targetMidi,
        lives: initialLivesForConfig(state.config),
        scoring: createScoringState(),
        startedAtMs: Date.now(),
        endedAtMs: null,
      }
    }

    case 'CORRECT_NOTE': {
      if (state.phase !== 'playing' || state.targetMidi == null) return state
      const scoring = applyCorrectNote(state.scoring)
      const targetMidi = nextTarget(state.notePool, state.targetMidi)
      return {
        ...state,
        scoring,
        targetMidi,
      }
    }

    case 'WRONG_NOTE': {
      if (state.phase !== 'playing' || !state.config || state.targetMidi == null) return state

      const scoring = applyIncorrectNote(state.scoring)
      const mode = state.config.mode

      if (mode === 'practice') {
        return {
          ...state,
          scoring,
        }
      }

      const lives = Math.max(0, state.lives - 1)
      if (lives <= 0) {
        return {
          ...state,
          scoring,
          lives: 0,
          phase: 'gameover',
          endedAtMs: Date.now(),
        }
      }

      return {
        ...state,
        scoring,
        lives,
        targetMidi: nextTarget(state.notePool, state.targetMidi),
      }
    }

    case 'RESTART':
      if (!state.config) return createInitialScaleRushState()
      return scaleRushReducer(
        { ...createInitialScaleRushState(), config: state.config },
        { type: 'START' },
      )

    case 'BACK_TO_SETUP':
      return {
        ...createInitialScaleRushState(),
        config: state.config,
      }

    default:
      return state
  }
}

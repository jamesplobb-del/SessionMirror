import type {
  BalanceNoteResult,
  BalancePhase,
  BalanceSettings,
  BalanceState,
  BalanceTarget,
} from './balanceTypes'

export type BalanceAction =
  | { type: 'UPDATE_SETTINGS'; settings: BalanceSettings; bestBalancedMs?: number }
  | { type: 'SET_BEST'; bestBalancedMs: number }
  | { type: 'START'; targets: BalanceTarget[]; bestBalancedMs: number }
  | { type: 'SET_PHASE'; phase: Exclude<BalancePhase, 'paused'> }
  | { type: 'SET_REST'; endsAt: number | null }
  | { type: 'COMPLETE_NOTE'; result: BalanceNoteResult }
  | { type: 'NEXT_NOTE' }
  | { type: 'RETRY_NOTE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'RESET' }
  | { type: 'ERROR'; message: string }

export function createBalanceState(
  settings: BalanceSettings,
  bestBalancedMs: number,
): BalanceState {
  return {
    phase: 'setup',
    resumePhase: null,
    settings,
    targets: [],
    targetIndex: 0,
    noteResults: [],
    currentResult: null,
    startedAt: null,
    restEndsAt: null,
    errorMessage: null,
    bestBalancedMs,
  }
}

function openingPhase(settings: BalanceSettings): BalancePhase {
  return settings.soundRest.countIn || settings.soundRest.referencePitch || settings.soundRest.continuousDrone
    ? 'countIn'
    : 'waitingForPitch'
}

export function balanceReducer(state: BalanceState, action: BalanceAction): BalanceState {
  switch (action.type) {
    case 'UPDATE_SETTINGS':
      return state.phase === 'setup'
        ? {
            ...state,
            settings: action.settings,
            bestBalancedMs: action.bestBalancedMs ?? state.bestBalancedMs,
          }
        : state
    case 'SET_BEST':
      return { ...state, bestBalancedMs: action.bestBalancedMs }
    case 'START':
      if (action.targets.length === 0) {
        return { ...state, phase: 'error', errorMessage: 'Add at least one note to start.' }
      }
      return {
        ...state,
        phase: openingPhase(state.settings),
        targets: action.targets,
        targetIndex: 0,
        noteResults: [],
        currentResult: null,
        startedAt: Date.now(),
        restEndsAt: null,
        errorMessage: null,
        bestBalancedMs: action.bestBalancedMs,
      }
    case 'SET_PHASE':
      return { ...state, phase: action.phase, resumePhase: null }
    case 'SET_REST':
      return { ...state, phase: 'resting', restEndsAt: action.endsAt }
    case 'COMPLETE_NOTE':
      return {
        ...state,
        phase: action.result.goalReached ? 'goalReached' : 'noteResults',
        currentResult: action.result,
        noteResults: [...state.noteResults, action.result],
      }
    case 'NEXT_NOTE': {
      const nextIndex = state.targetIndex + 1
      if (nextIndex >= state.targets.length) {
        return { ...state, phase: 'routineResults', currentResult: null, restEndsAt: null }
      }
      return {
        ...state,
        phase: openingPhase(state.settings),
        targetIndex: nextIndex,
        currentResult: null,
        restEndsAt: null,
      }
    }
    case 'RETRY_NOTE':
      return {
        ...state,
        phase: openingPhase(state.settings),
        currentResult: null,
        noteResults: state.noteResults.slice(0, -1),
        restEndsAt: null,
      }
    case 'PAUSE':
      if (
        state.phase === 'setup' ||
        state.phase === 'routineResults' ||
        state.phase === 'stopped' ||
        state.phase === 'paused'
      ) {
        return state
      }
      return { ...state, phase: 'paused', resumePhase: state.phase }
    case 'RESUME':
      if (state.phase !== 'paused') return state
      return {
        ...state,
        phase: state.resumePhase === 'resting' ? 'resting' : 'countIn',
        resumePhase: null,
      }
    case 'STOP':
      return { ...state, phase: 'stopped', resumePhase: null, restEndsAt: null }
    case 'ERROR':
      return { ...state, phase: 'error', errorMessage: action.message, resumePhase: null }
    case 'RESET':
      return createBalanceState(state.settings, state.bestBalancedMs)
  }
}

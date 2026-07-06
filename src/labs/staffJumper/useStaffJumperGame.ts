import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  getDetectedPitchClass,
  getTargetNoteAtStep,
  isReadoutCorrectPitch,
  isReadoutWrongPitch,
  loadBestScore,
  saveBestScore,
  type StaffJumperConfig,
  type StaffJumperState,
} from './staffJumperMusicLogic'

const CORRECT_DEBOUNCE_MS = 250
const WRONG_DEBOUNCE_MS = 300
const NOTE_TIMEOUT_MS = 12_000
const POST_ACTION_COOLDOWN_MS = 500

const INITIAL_HEARTS = 3

type Action =
  | { type: 'START'; config: StaffJumperConfig }
  | { type: 'SUCCESS' }
  | { type: 'MISS'; reason: 'wrong' | 'timeout' }
  | { type: 'FALL_COMPLETE' }
  | { type: 'RESTART' }
  | { type: 'BACK_TO_SETUP' }

function createInitialState(): StaffJumperState {
  return {
    phase: 'setup',
    config: null,
    sequenceStep: 0,
    targetPitchClass: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    hearts: INITIAL_HEARTS,
    correctCount: 0,
    missCount: 0,
    bestScore: loadBestScore(),
    advanceToken: 0,
    missToken: 0,
    feedback: null,
    feedbackToken: 0,
    isFalling: false,
    startedAtMs: null,
  }
}

function reducer(state: StaffJumperState, action: Action): StaffJumperState {
  switch (action.type) {
    case 'START': {
      const config = action.config
      const target = getTargetNoteAtStep(config, 0)
      return {
        ...createInitialState(),
        phase: 'playing',
        config,
        targetPitchClass: target.pitchClass,
        bestScore: loadBestScore(),
        startedAtMs: Date.now(),
      }
    }

    case 'SUCCESS': {
      if (state.phase !== 'playing' || !state.config) return state
      const nextStep = state.sequenceStep + 1
      const target = getTargetNoteAtStep(state.config, nextStep)
      const streak = state.streak + 1
      return {
        ...state,
        sequenceStep: nextStep,
        targetPitchClass: target.pitchClass,
        score: state.score + 1,
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
        correctCount: state.correctCount + 1,
        advanceToken: state.advanceToken + 1,
        feedback: 'good',
        feedbackToken: state.feedbackToken + 1,
      }
    }

    case 'MISS': {
      if (state.phase !== 'playing' || !state.config) return state
      const hearts = Math.max(0, state.hearts - 1)
      const feedback = action.reason === 'timeout' ? 'timeout' : 'wrong'
      if (hearts <= 0) {
        const bestScore = saveBestScore(state.score)
        return {
          ...state,
          hearts: 0,
          streak: 0,
          missCount: state.missCount + 1,
          missToken: state.missToken + 1,
          phase: 'playing',
          isFalling: true,
          bestScore,
          feedback,
          feedbackToken: state.feedbackToken + 1,
        }
      }
      return {
        ...state,
        hearts,
        streak: 0,
        missCount: state.missCount + 1,
        missToken: state.missToken + 1,
        feedback,
        feedbackToken: state.feedbackToken + 1,
      }
    }

    case 'FALL_COMPLETE': {
      if (!state.isFalling) return state
      return { ...state, phase: 'gameover', isFalling: false }
    }

    case 'RESTART':
      return state.config
        ? reducer({ ...createInitialState(), config: state.config }, { type: 'START', config: state.config })
        : createInitialState()

    case 'BACK_TO_SETUP':
      return { ...createInitialState(), bestScore: loadBestScore() }

    default:
      return state
  }
}

/**
 * Gameplay loop — pitch readout is read-only from useLivePitchTracker.
 * Target notes come only from getTargetNoteAtStep() in staffJumperMusicLogic.
 */
export function useStaffJumperGame(readout: PitchReadout, enabled: boolean) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const readoutRef = useRef(readout)
  readoutRef.current = readout

  const stateRef = useRef(state)
  stateRef.current = state

  const actionLockUntilRef = useRef(0)
  const wrongPitchClassRef = useRef<number | null>(null)

  const start = useCallback((config: StaffJumperConfig) => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    dispatch({ type: 'START', config })
  }, [])

  const restart = useCallback(() => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    dispatch({ type: 'RESTART' })
  }, [])

  const backToSetup = useCallback(() => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    dispatch({ type: 'BACK_TO_SETUP' })
  }, [])

  const completeFall = useCallback(() => {
    dispatch({ type: 'FALL_COMPLETE' })
  }, [])

  useEffect(() => {
    if (!enabled || state.phase !== 'playing' || state.isFalling) return

    let rafId = 0
    let lastTs = performance.now()
    let correctStableMs = 0
    let wrongStableMs = 0
    let targetSince = performance.now()

    const tick = (now: number) => {
      const current = stateRef.current
      if (current.phase !== 'playing' || !current.config || current.isFalling) return

      const dt = Math.min(now - lastTs, 50)
      lastTs = now

      if (now < actionLockUntilRef.current) {
        rafId = requestAnimationFrame(tick)
        return
      }

      const readoutNow = readoutRef.current
      const target = current.targetPitchClass

      if (isReadoutCorrectPitch(readoutNow, target)) {
        wrongStableMs = 0
        wrongPitchClassRef.current = null
        correctStableMs += dt
        if (correctStableMs >= CORRECT_DEBOUNCE_MS) {
          correctStableMs = 0
          targetSince = now
          actionLockUntilRef.current = now + POST_ACTION_COOLDOWN_MS
          wrongPitchClassRef.current = null
          dispatch({ type: 'SUCCESS' })
        }
      } else if (isReadoutWrongPitch(readoutNow, target)) {
        correctStableMs = 0
        const wrongPc = getDetectedPitchClass(readoutNow)!
        if (wrongPitchClassRef.current !== wrongPc) {
          wrongPitchClassRef.current = wrongPc
          wrongStableMs = 0
        }
        wrongStableMs += dt
        if (wrongStableMs >= WRONG_DEBOUNCE_MS) {
          wrongStableMs = 0
          targetSince = now
          actionLockUntilRef.current = now + POST_ACTION_COOLDOWN_MS
          wrongPitchClassRef.current = null
          dispatch({ type: 'MISS', reason: 'wrong' })
        }
      } else {
        correctStableMs = 0
        wrongStableMs = 0
        wrongPitchClassRef.current = null
      }

      if (now - targetSince >= NOTE_TIMEOUT_MS) {
        targetSince = now
        correctStableMs = 0
        wrongStableMs = 0
        actionLockUntilRef.current = now + POST_ACTION_COOLDOWN_MS
        wrongPitchClassRef.current = null
        dispatch({ type: 'MISS', reason: 'timeout' })
      }

      rafId = requestAnimationFrame(tick)
    }

    targetSince = performance.now()
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [enabled, state.phase, state.sequenceStep, state.isFalling])

  return { state, start, restart, backToSetup, completeFall }
}

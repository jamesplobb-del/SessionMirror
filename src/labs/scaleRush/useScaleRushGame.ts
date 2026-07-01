import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  getTargetNoteAtStep,
  isReadoutCorrectPitch,
  isReadoutWrongPitch,
  loadBestScore,
  pitchClassesMatch,
  readoutToPitchClass,
  saveBestScore,
} from './scaleRushMusicLogic'
import type { ScaleRushConfig, ScaleRushState } from './types'

/** Stable correct note before advancing. */
const CORRECT_DEBOUNCE_MS = 400
/** Stable wrong note before miss — long enough to ignore flickery noise. */
const WRONG_DEBOUNCE_MS = 900
/** Per-note timeout. */
const NOTE_TIMEOUT_MS = 12_000
/** Minimum gap after any success/miss before listening again (prevents noise bursts). */
const POST_ACTION_COOLDOWN_MS = 1_200

const INITIAL_HEARTS = 3

type Action =
  | { type: 'START'; config: ScaleRushConfig }
  | { type: 'SUCCESS' }
  | { type: 'MISS'; reason: 'wrong' | 'timeout' }
  | { type: 'RESTART' }
  | { type: 'BACK_TO_SETUP' }

function createInitialState(): ScaleRushState {
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
    startedAtMs: null,
  }
}

function reducer(state: ScaleRushState, action: Action): ScaleRushState {
  switch (action.type) {
    case 'START': {
      const target = getTargetNoteAtStep(action.config, 0)
      return {
        ...createInitialState(),
        phase: 'playing',
        config: action.config,
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
      }
    }

    case 'MISS': {
      if (state.phase !== 'playing' || !state.config) return state
      const hearts = Math.max(0, state.hearts - 1)
      const nextStep = state.sequenceStep + 1
      const target = getTargetNoteAtStep(state.config, nextStep)
      if (hearts <= 0) {
        const bestScore = saveBestScore(state.score)
        return {
          ...state,
          hearts: 0,
          streak: 0,
          missCount: state.missCount + 1,
          missToken: state.missToken + 1,
          phase: 'gameover',
          bestScore,
        }
      }
      return {
        ...state,
        hearts,
        streak: 0,
        missCount: state.missCount + 1,
        missToken: state.missToken + 1,
        sequenceStep: nextStep,
        targetPitchClass: target.pitchClass,
      }
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
 * Scale Rush gameplay loop.
 * Pitch: read-only readout from useLivePitchTracker. Ambient noise is rejected via
 * gameplay-specific gates in scaleRushMusicLogic (not global pitch engine changes).
 */
export function useScaleRushGame(readout: PitchReadout, enabled: boolean) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const readoutRef = useRef(readout)
  readoutRef.current = readout

  const stateRef = useRef(state)
  stateRef.current = state

  /** Persists across sequence-step effect re-runs — stops burst advances from noise. */
  const actionLockUntilRef = useRef(0)
  const wrongPitchClassRef = useRef<number | null>(null)

  const start = useCallback((config: ScaleRushConfig) => {
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

  const lockActions = useCallback((now: number) => {
    actionLockUntilRef.current = now + POST_ACTION_COOLDOWN_MS
    wrongPitchClassRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled || state.phase !== 'playing') return

    let rafId = 0
    let lastTs = performance.now()
    let correctStableMs = 0
    let wrongStableMs = 0
    let targetSince = performance.now()

    const tick = (now: number) => {
      const current = stateRef.current
      if (current.phase !== 'playing') return

      const dt = Math.min(now - lastTs, 50)
      lastTs = now

      if (now < actionLockUntilRef.current) {
        rafId = requestAnimationFrame(tick)
        return
      }

      const readoutNow = readoutRef.current
      const target = current.targetPitchClass
      const detected = readoutToPitchClass(readoutNow)

      if (detected != null && isReadoutCorrectPitch(readoutNow) && pitchClassesMatch(detected, target)) {
        wrongStableMs = 0
        wrongPitchClassRef.current = null
        correctStableMs += dt
        if (correctStableMs >= CORRECT_DEBOUNCE_MS) {
          correctStableMs = 0
          targetSince = now
          lockActions(now)
          dispatch({ type: 'SUCCESS' })
        }
      } else if (isReadoutWrongPitch(readoutNow, target)) {
        correctStableMs = 0
        const wrongPc = readoutToPitchClass(readoutNow)!
        if (wrongPitchClassRef.current !== wrongPc) {
          wrongPitchClassRef.current = wrongPc
          wrongStableMs = 0
        }
        wrongStableMs += dt
        if (wrongStableMs >= WRONG_DEBOUNCE_MS) {
          wrongStableMs = 0
          targetSince = now
          lockActions(now)
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
        lockActions(now)
        dispatch({ type: 'MISS', reason: 'timeout' })
      }

      rafId = requestAnimationFrame(tick)
    }

    targetSince = performance.now()
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [enabled, lockActions, state.phase, state.sequenceStep])

  return { state, start, restart, backToSetup }
}

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  loadBestScore,
  pitchClassForSequenceStep,
  pitchClassesMatch,
  readoutToPitchClass,
  isReadoutStableEnough,
  saveBestScore,
} from './scaleRushMusicLogic'
import type { ScaleRushConfig, ScaleRushState } from './types'

/** Stable correct note before advancing. */
const CORRECT_DEBOUNCE_MS = 280
/** Stable wrong note before miss. */
const WRONG_DEBOUNCE_MS = 520
/** Per-note timeout. */
const NOTE_TIMEOUT_MS = 10_000
/** Ignore pitch after success so sustained notes do not double-trigger. */
const POST_SUCCESS_COOLDOWN_MS = 500

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
      const targetPitchClass = pitchClassForSequenceStep(action.config.key, 0)
      return {
        ...createInitialState(),
        phase: 'playing',
        config: action.config,
        targetPitchClass,
        bestScore: loadBestScore(),
        startedAtMs: Date.now(),
      }
    }

    case 'SUCCESS': {
      if (state.phase !== 'playing' || !state.config) return state
      const nextStep = state.sequenceStep + 1
      const streak = state.streak + 1
      return {
        ...state,
        sequenceStep: nextStep,
        targetPitchClass: pitchClassForSequenceStep(state.config.key, nextStep),
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
        targetPitchClass: pitchClassForSequenceStep(state.config.key, nextStep),
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
 *
 * Pitch integration: consumes readout from useLivePitchTracker (mic source).
 * Matching uses pitch class only — octave does not block success in v0.1.
 */
export function useScaleRushGame(readout: PitchReadout, enabled: boolean) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const readoutRef = useRef(readout)
  readoutRef.current = readout

  const stateRef = useRef(state)
  stateRef.current = state

  const start = useCallback((config: ScaleRushConfig) => {
    dispatch({ type: 'START', config })
  }, [])

  const restart = useCallback(() => dispatch({ type: 'RESTART' }), [])
  const backToSetup = useCallback(() => dispatch({ type: 'BACK_TO_SETUP' }), [])

  const awaitingTargetRef = useRef(false)

  useEffect(() => {
    if (!enabled || state.phase !== 'playing') return

    awaitingTargetRef.current = false
    let rafId = 0
    let lastTs = performance.now()
    let correctStableMs = 0
    let wrongStableMs = 0
    let targetSince = performance.now()
    let postCooldownUntil = 0

    const tick = (now: number) => {
      const current = stateRef.current
      if (current.phase !== 'playing') return

      const dt = Math.min(now - lastTs, 80)
      lastTs = now

      if (awaitingTargetRef.current) {
        rafId = requestAnimationFrame(tick)
        return
      }

      if (now < postCooldownUntil) {
        rafId = requestAnimationFrame(tick)
        return
      }

      const readoutNow = readoutRef.current
      const detected = readoutToPitchClass(readoutNow)
      const stable = isReadoutStableEnough(readoutNow)
      const target = current.targetPitchClass

      if (detected != null && stable) {
        if (pitchClassesMatch(detected, target)) {
          wrongStableMs = 0
          correctStableMs += dt
          if (correctStableMs >= CORRECT_DEBOUNCE_MS) {
            if (import.meta.env.DEV) {
              console.log('[ScaleRush] correct', {
                detected: detected,
                target,
                note: readoutNow.noteName,
              })
            }
            awaitingTargetRef.current = true
            correctStableMs = 0
            wrongStableMs = 0
            postCooldownUntil = now + POST_SUCCESS_COOLDOWN_MS
            targetSince = now
            dispatch({ type: 'SUCCESS' })
          }
        } else {
          correctStableMs = 0
          wrongStableMs += dt
          if (wrongStableMs >= WRONG_DEBOUNCE_MS) {
            if (import.meta.env.DEV) {
              console.log('[ScaleRush] miss wrong', {
                detected,
                target,
                note: readoutNow.noteName,
              })
            }
            awaitingTargetRef.current = true
            wrongStableMs = 0
            correctStableMs = 0
            targetSince = now
            postCooldownUntil = now + POST_SUCCESS_COOLDOWN_MS
            dispatch({ type: 'MISS', reason: 'wrong' })
          }
        }
      } else {
        correctStableMs = 0
        wrongStableMs = 0
      }

      if (now - targetSince >= NOTE_TIMEOUT_MS) {
        if (import.meta.env.DEV) {
          console.log('[ScaleRush] miss timeout', { target })
        }
        awaitingTargetRef.current = true
        targetSince = now
        correctStableMs = 0
        wrongStableMs = 0
        postCooldownUntil = now + POST_SUCCESS_COOLDOWN_MS
        dispatch({ type: 'MISS', reason: 'timeout' })
      }

      rafId = requestAnimationFrame(tick)
    }

    targetSince = performance.now()
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [enabled, state.phase, state.targetPitchClass, state.sequenceStep])

  return { state, start, restart, backToSetup }
}

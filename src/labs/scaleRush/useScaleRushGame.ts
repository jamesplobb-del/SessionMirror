import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  getDetectedWrittenPitchClass,
  getTargetNoteAtStep,
  isReadoutCorrectPitch,
  isReadoutWrongPitch,
  loadBestScore,
  saveBestScore,
} from './scaleRushMusicLogic'
import type { ScaleRushConfig, ScaleRushState } from './scaleRushTypes'
import { triggerSuccessHaptic, triggerWarningHaptic } from '../../utils/haptics'

/** Require a brief stable tone so attacks and room noise do not trigger a move. */
const CORRECT_DEBOUNCE_STRICT_MS = 250
const CORRECT_DEBOUNCE_LOOSE_MS = 120
/** Forgiving mode waits longer before treating a detected pitch as a miss. */
const WRONG_DEBOUNCE_STRICT_MS = 300
const WRONG_DEBOUNCE_LOOSE_MS = 600
const NOTE_TIMEOUT_MS = 12_000
const POST_ACTION_COOLDOWN_STRICT_MS = 500
const POST_ACTION_COOLDOWN_LOOSE_MS = 380

const INITIAL_HEARTS = 3

type Action =
  | { type: 'START'; config: ScaleRushConfig }
  | { type: 'SUCCESS' }
  | { type: 'MISS'; reason: 'wrong' | 'timeout' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
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
    feedback: null,
    feedbackToken: 0,
    startedAtMs: null,
    endedAtMs: null,
    pausedAtMs: null,
    pausedDurationMs: 0,
  }
}

function reducer(state: ScaleRushState, action: Action): ScaleRushState {
  switch (action.type) {
    case 'START': {
      const config: ScaleRushConfig = {
        ...action.config,
        sessionSeed: (Math.random() * 0x1_0000_0000) >>> 0,
      }
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
        feedback: streak >= 5 ? 'perfect' : 'good',
        feedbackToken: state.feedbackToken + 1,
      }
    }

    case 'MISS': {
      if (state.phase !== 'playing' || !state.config) return state
      const hearts = Math.max(0, state.hearts - 1)
      const nextStep = state.sequenceStep + 1
      const target = getTargetNoteAtStep(state.config, nextStep)
      const feedback = action.reason === 'timeout' ? 'timeout' : 'wrong'
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
          feedback,
          feedbackToken: state.feedbackToken + 1,
          endedAtMs: Date.now(),
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
        feedback,
        feedbackToken: state.feedbackToken + 1,
      }
    }

    case 'PAUSE':
      return state.phase === 'playing'
        ? { ...state, phase: 'paused', pausedAtMs: Date.now() }
        : state

    case 'RESUME': {
      if (state.phase !== 'paused') return state
      const resumedAt = Date.now()
      return {
        ...state,
        phase: 'playing',
        pausedAtMs: null,
        pausedDurationMs:
          state.pausedDurationMs +
          (state.pausedAtMs == null ? 0 : Math.max(0, resumedAt - state.pausedAtMs)),
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
 * Gameplay loop — pitch readout is read-only from useLivePitchTracker.
 * Target notes come only from getTargetNoteAtStep() in scaleRushMusicLogic.
 */
export function useScaleRushGame(
  readout: PitchReadout,
  enabled: boolean,
  hapticFeedback = true,
) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const readoutRef = useRef(readout)
  readoutRef.current = readout

  const stateRef = useRef(state)
  stateRef.current = state

  const actionLockUntilRef = useRef(0)
  const wrongPitchClassRef = useRef<number | null>(null)
  const noteDeadlineAtRef = useRef<number | null>(null)
  const noteRemainingMsRef = useRef(NOTE_TIMEOUT_MS)

  const resetNoteClock = useCallback(() => {
    noteDeadlineAtRef.current = null
    noteRemainingMsRef.current = NOTE_TIMEOUT_MS
  }, [])

  const captureNoteClock = useCallback(() => {
    const deadline = noteDeadlineAtRef.current
    if (deadline != null) {
      noteRemainingMsRef.current = Math.max(0, Math.min(NOTE_TIMEOUT_MS, deadline - performance.now()))
    }
    noteDeadlineAtRef.current = null
  }, [])

  const start = useCallback((config: ScaleRushConfig) => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    resetNoteClock()
    dispatch({ type: 'START', config })
  }, [resetNoteClock])

  const restart = useCallback(() => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    resetNoteClock()
    dispatch({ type: 'RESTART' })
  }, [resetNoteClock])

  const backToSetup = useCallback(() => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    resetNoteClock()
    dispatch({ type: 'BACK_TO_SETUP' })
  }, [resetNoteClock])

  const pause = useCallback(() => {
    if (stateRef.current.phase !== 'playing') return
    captureNoteClock()
    dispatch({ type: 'PAUSE' })
  }, [captureNoteClock])

  const resume = useCallback(() => {
    actionLockUntilRef.current = performance.now() + 600
    wrongPitchClassRef.current = null
    dispatch({ type: 'RESUME' })
  }, [])

  useEffect(() => {
    const pauseForVisibilityLoss = () => {
      if (document.visibilityState !== 'visible') pause()
    }
    const pauseForPageHide = () => pause()

    document.addEventListener('visibilitychange', pauseForVisibilityLoss)
    window.addEventListener('pagehide', pauseForPageHide)

    let cancelled = false
    let removeNativeListener: (() => void) | undefined
    void (async () => {
      const { Capacitor } = await import('@capacitor/core')
      if (cancelled || !Capacitor.isNativePlatform()) return
      const { App } = await import('@capacitor/app')
      if (cancelled) return
      const listener = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) pause()
      })
      if (cancelled) {
        void listener.remove()
        return
      }
      removeNativeListener = () => void listener.remove()
    })()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', pauseForVisibilityLoss)
      window.removeEventListener('pagehide', pauseForPageHide)
      removeNativeListener?.()
    }
  }, [pause])

  const lastFeedbackTokenRef = useRef(0)
  useEffect(() => {
    if (state.feedbackToken === 0 || state.feedbackToken === lastFeedbackTokenRef.current) return
    lastFeedbackTokenRef.current = state.feedbackToken
    if (state.feedback === 'good' || state.feedback === 'perfect') {
      triggerSuccessHaptic(hapticFeedback)
    } else if (state.feedback === 'wrong' || state.feedback === 'timeout') {
      triggerWarningHaptic(hapticFeedback)
    }
  }, [hapticFeedback, state.feedback, state.feedbackToken])

  useEffect(() => {
    if (!enabled || state.phase !== 'playing') return

    let rafId = 0
    let lastTs = performance.now()
    let correctStableMs = 0
    let wrongStableMs = 0
    const initialRemainingMs = Math.max(0, Math.min(NOTE_TIMEOUT_MS, noteRemainingMsRef.current))
    let targetDeadlineAt = performance.now() + initialRemainingMs
    noteDeadlineAtRef.current = targetDeadlineAt

    const resetTargetDeadline = (now: number) => {
      targetDeadlineAt = now + NOTE_TIMEOUT_MS
      noteDeadlineAtRef.current = targetDeadlineAt
      noteRemainingMsRef.current = NOTE_TIMEOUT_MS
    }

    const tick = (now: number) => {
      const current = stateRef.current
      const config = current.config
      if (
        current.phase !== 'playing' ||
        !config ||
        noteDeadlineAtRef.current !== targetDeadlineAt
      ) return

      const dt = Math.min(now - lastTs, 50)
      lastTs = now

      const strict = config.pitchAccuracyStrict
      const correctDebounce = strict ? CORRECT_DEBOUNCE_STRICT_MS : CORRECT_DEBOUNCE_LOOSE_MS
      const wrongDebounce = strict ? WRONG_DEBOUNCE_STRICT_MS : WRONG_DEBOUNCE_LOOSE_MS
      const postCooldown = strict ? POST_ACTION_COOLDOWN_STRICT_MS : POST_ACTION_COOLDOWN_LOOSE_MS

      if (now < actionLockUntilRef.current) {
        if (now >= targetDeadlineAt) {
          resetTargetDeadline(now)
          dispatch({ type: 'MISS', reason: 'timeout' })
        }
        rafId = requestAnimationFrame(tick)
        return
      }

      const readoutNow = readoutRef.current
      const target = current.targetPitchClass

      if (isReadoutCorrectPitch(readoutNow, target, config)) {
        wrongStableMs = 0
        wrongPitchClassRef.current = null
        correctStableMs += dt
        if (correctStableMs >= correctDebounce) {
          correctStableMs = 0
          resetTargetDeadline(now)
          actionLockUntilRef.current = now + postCooldown
          wrongPitchClassRef.current = null
          dispatch({ type: 'SUCCESS' })
        }
      } else if (isReadoutWrongPitch(readoutNow, target, config)) {
        correctStableMs = 0
        const wrongPc = getDetectedWrittenPitchClass(readoutNow, config)!
        if (wrongPitchClassRef.current !== wrongPc) {
          wrongPitchClassRef.current = wrongPc
          wrongStableMs = 0
        }
        wrongStableMs += dt
        if (wrongStableMs >= wrongDebounce) {
          wrongStableMs = 0
          resetTargetDeadline(now)
          actionLockUntilRef.current = now + postCooldown
          wrongPitchClassRef.current = null
          dispatch({ type: 'MISS', reason: 'wrong' })
        }
      } else {
        correctStableMs = 0
        wrongStableMs = 0
        wrongPitchClassRef.current = null
      }

      if (now >= targetDeadlineAt) {
        resetTargetDeadline(now)
        correctStableMs = 0
        wrongStableMs = 0
        actionLockUntilRef.current = now + postCooldown
        wrongPitchClassRef.current = null
        dispatch({ type: 'MISS', reason: 'timeout' })
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      if (noteDeadlineAtRef.current === targetDeadlineAt) {
        noteRemainingMsRef.current = Math.max(
          0,
          Math.min(NOTE_TIMEOUT_MS, targetDeadlineAt - performance.now()),
        )
        noteDeadlineAtRef.current = null
      }
    }
  }, [enabled, state.phase, state.sequenceStep])

  return {
    state,
    start,
    restart,
    backToSetup,
    pause,
    resume,
    noteRemainingMs: Math.max(0, Math.min(NOTE_TIMEOUT_MS, noteRemainingMsRef.current)),
    noteTimeoutMs: NOTE_TIMEOUT_MS,
  }
}

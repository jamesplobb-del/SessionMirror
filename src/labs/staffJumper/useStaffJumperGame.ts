import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  getDetectedPitchClass,
  getTargetNoteAtStep,
  DIFFICULTY_TIMEOUT_SECONDS,
  isReadoutCorrectPitch,
  isReadoutWrongPitch,
  loadBestScore,
  saveBestScore,
  type StaffJumperConfig,
  type StaffJumperState,
} from './staffJumperMusicLogic'
import { triggerSuccessHaptic, triggerWarningHaptic } from '../../utils/haptics'

const DIFFICULTY_TIMING = {
  easy: { correctMs: 160, wrongMs: 700, cooldownMs: 400 },
  medium: { correctMs: 240, wrongMs: 475, cooldownMs: 475 },
  hard: { correctMs: 300, wrongMs: 325, cooldownMs: 525 },
} as const

const INITIAL_HEARTS = 3

type Action =
  | { type: 'START'; config: StaffJumperConfig }
  | { type: 'SUCCESS'; quality: 'perfect' | 'good' }
  | { type: 'MISS'; reason: 'wrong' | 'timeout' }
  | { type: 'FALL_COMPLETE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
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
    endedAtMs: null,
    pausedAtMs: null,
    pausedDurationMs: 0,
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
        feedback: action.quality,
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
          endedAtMs: Date.now(),
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

    case 'PAUSE':
      return state.phase === 'playing' && !state.isFalling
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
 * Target notes come only from getTargetNoteAtStep() in staffJumperMusicLogic.
 */
export function useStaffJumperGame(
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
  const noteRemainingMsRef = useRef(DIFFICULTY_TIMEOUT_SECONDS.medium * 1000)

  const resetNoteClock = useCallback((timeoutMs: number) => {
    noteDeadlineAtRef.current = null
    noteRemainingMsRef.current = timeoutMs
  }, [])

  const captureNoteClock = useCallback(() => {
    const deadline = noteDeadlineAtRef.current
    if (deadline != null) {
      noteRemainingMsRef.current = Math.max(0, deadline - performance.now())
    }
    noteDeadlineAtRef.current = null
  }, [])

  const start = useCallback((config: StaffJumperConfig) => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    resetNoteClock(DIFFICULTY_TIMEOUT_SECONDS[config.difficulty] * 1000)
    dispatch({ type: 'START', config })
  }, [resetNoteClock])

  const restart = useCallback(() => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    const config = stateRef.current.config
    resetNoteClock(
      config
        ? DIFFICULTY_TIMEOUT_SECONDS[config.difficulty] * 1000
        : DIFFICULTY_TIMEOUT_SECONDS.medium * 1000,
    )
    dispatch({ type: 'RESTART' })
  }, [resetNoteClock])

  const backToSetup = useCallback(() => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    resetNoteClock(DIFFICULTY_TIMEOUT_SECONDS.medium * 1000)
    dispatch({ type: 'BACK_TO_SETUP' })
  }, [resetNoteClock])

  const completeFall = useCallback(() => {
    dispatch({ type: 'FALL_COMPLETE' })
  }, [])

  const pause = useCallback(() => {
    const current = stateRef.current
    if (current.phase !== 'playing' || current.isFalling) return
    captureNoteClock()
    dispatch({ type: 'PAUSE' })
  }, [captureNoteClock])

  const resume = useCallback(() => {
    actionLockUntilRef.current = performance.now() + 650
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
    if (!enabled || state.phase !== 'playing' || state.isFalling) return

    let rafId = 0
    let lastTs = performance.now()
    let correctStableMs = 0
    let wrongStableMs = 0
    const noteTimeoutMs = DIFFICULTY_TIMEOUT_SECONDS[state.config!.difficulty] * 1000
    const initialRemainingMs = Math.max(0, Math.min(noteTimeoutMs, noteRemainingMsRef.current))
    let targetDeadlineAt = performance.now() + initialRemainingMs
    noteDeadlineAtRef.current = targetDeadlineAt

    const resetTargetDeadline = (now: number) => {
      targetDeadlineAt = now + noteTimeoutMs
      noteDeadlineAtRef.current = targetDeadlineAt
      noteRemainingMsRef.current = noteTimeoutMs
    }

    const tick = (now: number) => {
      const current = stateRef.current
      if (
        current.phase !== 'playing' ||
        !current.config ||
        current.isFalling ||
        noteDeadlineAtRef.current !== targetDeadlineAt
      ) return

      const dt = Math.min(now - lastTs, 50)
      lastTs = now

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
      const timing = DIFFICULTY_TIMING[current.config.difficulty]

      if (isReadoutCorrectPitch(readoutNow, target, current.config)) {
        wrongStableMs = 0
        wrongPitchClassRef.current = null
        correctStableMs += dt
        if (correctStableMs >= timing.correctMs) {
          correctStableMs = 0
          resetTargetDeadline(now)
          actionLockUntilRef.current = now + timing.cooldownMs
          wrongPitchClassRef.current = null
          dispatch({ type: 'SUCCESS', quality: Math.abs(readoutNow.cents) <= 8 ? 'perfect' : 'good' })
        }
      } else if (isReadoutWrongPitch(readoutNow, target, current.config)) {
        correctStableMs = 0
        const wrongPc = getDetectedPitchClass(readoutNow)!
        if (wrongPitchClassRef.current !== wrongPc) {
          wrongPitchClassRef.current = wrongPc
          wrongStableMs = 0
        }
        wrongStableMs += dt
        if (wrongStableMs >= timing.wrongMs) {
          wrongStableMs = 0
          resetTargetDeadline(now)
          actionLockUntilRef.current = now + timing.cooldownMs
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
        actionLockUntilRef.current = now + timing.cooldownMs
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
          Math.min(noteTimeoutMs, targetDeadlineAt - performance.now()),
        )
        noteDeadlineAtRef.current = null
      }
    }
  }, [enabled, state.phase, state.sequenceStep, state.isFalling])

  const configuredTimeoutMs = state.config
    ? DIFFICULTY_TIMEOUT_SECONDS[state.config.difficulty] * 1000
    : DIFFICULTY_TIMEOUT_SECONDS.medium * 1000

  return {
    state,
    start,
    restart,
    backToSetup,
    completeFall,
    pause,
    resume,
    noteRemainingMs: Math.max(0, Math.min(configuredTimeoutMs, noteRemainingMsRef.current)),
    noteTimeoutMs: configuredTimeoutMs,
  }
}

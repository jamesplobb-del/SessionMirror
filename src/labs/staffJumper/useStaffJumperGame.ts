import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  getConcertTonicPitchClass,
  getDetectedPitchClass,
  getRhythmForStep,
  getTargetNoteAtStep,
  DIFFICULTY_TIMEOUT_SECONDS,
  isReadoutCorrectPitch,
  isReadoutWrongPitch,
  loadBestScore,
  saveBestScore,
  type StaffJumperConfig,
  type StaffJumperState,
  type StaffJumperTiming,
} from './staffJumperMusicLogic'
import type { StaffJumperMeter } from './staffJumperRhythm'
import { judgeTiming, METERS, secondsPerPulse } from './staffJumperRhythm'
import {
  startClickTrack,
  startDrone,
  type ClickTrackHandle,
  type DroneHandle,
} from './staffJumperAudio'
import { triggerSuccessHaptic, triggerWarningHaptic } from '../../utils/haptics'

const DIFFICULTY_TIMING = {
  easy: { correctMs: 34, wrongMs: 620, cooldownMs: 12 },
  medium: { correctMs: 30, wrongMs: 440, cooldownMs: 12 },
  hard: { correctMs: 26, wrongMs: 300, cooldownMs: 12 },
} as const

/**
 * How long the same pitch must keep sounding to count as a deliberately
 * repeated note rather than the decay of the one before it.
 *
 * Only relevant when a pattern happens to land on the same pitch class twice in
 * a row; every other case clears the release gate as soon as the pitch moves.
 */
const REPEATED_NOTE_HOLD_MS = 170

/**
 * Bars of clicks before the first note.
 *
 * 6/8 only has two pulses to a bar, so a single bar would be a two-click
 * count-in — not enough to feel the tempo. Compound meters get two bars.
 */
function countInBarsFor(meter: StaffJumperMeter): number {
  return METERS[meter].pulsesPerBar >= 4 ? 1 : 2
}

/** Headroom for the audio context to resume before the count-in is timed out. */
const AUDIO_START_GRACE_MS = 700

const INITIAL_HEARTS = 3

type Action =
  | { type: 'START'; config: StaffJumperConfig }
  | { type: 'SUCCESS'; quality: 'perfect' | 'good'; timing: StaffJumperTiming; timingErrorMs: number }
  | { type: 'MISS'; reason: 'wrong' | 'timeout' }
  | { type: 'FALL_COMPLETE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RESTART' }
  | { type: 'BACK_TO_SETUP' }
  | { type: 'COUNT_IN_COMPLETE' }

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
    timing: null,
    timingErrorMs: 0,
    onTimeCount: 0,
    isCountingIn: false,
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
        isCountingIn: true,
      }
    }

    case 'COUNT_IN_COMPLETE':
      return state.isCountingIn ? { ...state, isCountingIn: false } : state

    case 'SUCCESS': {
      if (state.phase !== 'playing' || !state.config) return state
      const nextStep = state.sequenceStep + 1
      const target = getTargetNoteAtStep(state.config, nextStep)
      const streak = state.streak + 1
      // Landing on the beat is worth an extra point — timing is a bonus, never
      // a penalty, so a late note still advances and still scores.
      const onTime = action.timing === 'on'
      return {
        ...state,
        sequenceStep: nextStep,
        targetPitchClass: target.pitchClass,
        score: state.score + (onTime ? 2 : 1),
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
        correctCount: state.correctCount + 1,
        onTimeCount: state.onTimeCount + (onTime ? 1 : 0),
        timing: action.timing,
        timingErrorMs: action.timingErrorMs,
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
        // Resuming replays the count-in, so pitch is ignored until it lands.
        isCountingIn: true,
        timing: null,
        pausedDurationMs:
          state.pausedDurationMs +
          (state.pausedAtMs == null ? 0 : Math.max(0, resumedAt - state.pausedAtMs)),
      }
    }

    case 'RESTART':
      return state.config
        ? reducer(
            { ...createInitialState(), config: state.config },
            {
              type: 'START',
              config: { ...state.config, sessionSeed: Date.now() },
            },
          )
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
  /**
   * Pitch class the player is still releasing.
   *
   * Detection is deliberately fast, so the moment a note is accepted the game
   * moves to the next target while the previous note is still ringing. Without
   * this gate that decay reads as a wrong answer against the new target — the
   * player had to clip every note short to avoid losing hearts. It also stops a
   * single held wrong note from burning all three hearts in a row.
   */
  const releasingPitchClassRef = useRef<number | null>(null)
  const noteDeadlineAtRef = useRef<number | null>(null)
  const noteRemainingMsRef = useRef(DIFFICULTY_TIMEOUT_SECONDS.medium * 1000)

  const clickRef = useRef<ClickTrackHandle | null>(null)
  const droneRef = useRef<DroneHandle | null>(null)
  /**
   * Pulse position the next note is *expected* on.
   *
   * Re-anchored after every landing to "where you actually were, plus the note
   * you just held". Judging against a fixed grid instead would mean one slow
   * note marked everything after it late for the rest of the run, and it would
   * also bake in the detector's own latency; measuring note-to-note cancels
   * that constant offset out.
   */
  const expectedPulseRef = useRef(0)
  /**
   * Wall-clock backstop for the count-in.
   *
   * The click handle only exists once the audio context has resumed, and on a
   * blocked or suspended context it never will — its clock simply stops. Without
   * this the game would sit in the count-in forever waiting for a beat that is
   * never going to arrive.
   */
  const countInUntilMsRef = useRef(0)
  /**
   * Bumped by every start and stop.
   *
   * Audio starts asynchronously, so a handle can arrive after the run it
   * belongs to has already been stopped, restarted or paused. Comparing against
   * game state here would be wrong — a `start()` dispatch has not been committed
   * by React yet when the audio promise resolves — so the token is the only
   * reliable way to know whether a late handle is still wanted.
   */
  const audioGenerationRef = useRef(0)

  const stopAudio = useCallback(() => {
    audioGenerationRef.current += 1
    clickRef.current?.stop()
    clickRef.current = null
    const drone = droneRef.current
    droneRef.current = null
    if (drone) void drone.stop()
  }, [])

  const startAudio = useCallback((config: StaffJumperConfig) => {
    stopAudio()
    expectedPulseRef.current = 0

    const generation = audioGenerationRef.current
    const spec = METERS[config.meter]
    const countInMs =
      countInBarsFor(config.meter) * spec.pulsesPerBar * secondsPerPulse(config.tempoBpm) * 1000
    countInUntilMsRef.current = performance.now() + countInMs + AUDIO_START_GRACE_MS

    void startClickTrack({
      bpm: config.tempoBpm,
      soundId: 'classic',
      audible: config.metronome,
      countInBars: countInBarsFor(config.meter),
      meter: config.meter,
    })
      .then((handle) => {
        if (audioGenerationRef.current !== generation) handle.stop()
        else clickRef.current = handle
      })
      .catch(() => {
        /* audio is optional — the game stays playable without a click */
      })

    if (config.drone) {
      void startDrone(getConcertTonicPitchClass(config))
        .then((handle) => {
          if (audioGenerationRef.current !== generation) void handle.stop()
          else droneRef.current = handle
        })
        .catch(() => {
          /* drone is optional */
        })
    }
  }, [stopAudio])

  useEffect(() => stopAudio, [stopAudio])

  // The run is over the moment the player starts falling — cut the click and
  // drone then rather than waiting for the game-over screen to mount.
  useEffect(() => {
    if (state.isFalling) stopAudio()
  }, [state.isFalling, stopAudio])

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
    releasingPitchClassRef.current = null
    resetNoteClock(DIFFICULTY_TIMEOUT_SECONDS[config.difficulty] * 1000)
    const seeded = { ...config, sessionSeed: config.sessionSeed ?? Date.now() }
    dispatch({ type: 'START', config: seeded })
    startAudio(seeded)
  }, [resetNoteClock, startAudio])

  const restart = useCallback(() => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    releasingPitchClassRef.current = null
    const config = stateRef.current.config
    resetNoteClock(
      config
        ? DIFFICULTY_TIMEOUT_SECONDS[config.difficulty] * 1000
        : DIFFICULTY_TIMEOUT_SECONDS.medium * 1000,
    )
    dispatch({ type: 'RESTART' })
    if (config) startAudio({ ...config, sessionSeed: Date.now() })
  }, [resetNoteClock, startAudio])

  const backToSetup = useCallback(() => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    releasingPitchClassRef.current = null
    resetNoteClock(DIFFICULTY_TIMEOUT_SECONDS.medium * 1000)
    stopAudio()
    dispatch({ type: 'BACK_TO_SETUP' })
  }, [resetNoteClock, stopAudio])

  const completeFall = useCallback(() => {
    dispatch({ type: 'FALL_COMPLETE' })
  }, [])

  const pause = useCallback(() => {
    const current = stateRef.current
    if (current.phase !== 'playing' || current.isFalling) return
    captureNoteClock()
    stopAudio()
    dispatch({ type: 'PAUSE' })
  }, [captureNoteClock, stopAudio])

  const resume = useCallback(() => {
    actionLockUntilRef.current = performance.now() + 650
    wrongPitchClassRef.current = null
    releasingPitchClassRef.current = null
    const config = stateRef.current.config
    dispatch({ type: 'RESUME' })
    // A fresh count-in re-establishes the tempo, and restarting the transport
    // re-anchors the beat clock so the first note back is judged from zero.
    if (config) startAudio(config)
  }, [startAudio])

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

      // Hold everything — pitch, the note clock, the lot — until the count-in
      // has played, so warm-up notes over the click cannot score or cost a life.
      const click = clickRef.current
      if (current.isCountingIn) {
        // Whichever clock says "done" first wins: the audio clock is the
        // accurate one, the wall clock is the escape hatch when audio is
        // blocked or still starting up.
        const audioRemainingMs =
          click && click.isRunning() ? click.countInRemainingSec() * 1000 : Number.POSITIVE_INFINITY
        const wallRemainingMs = countInUntilMsRef.current - now
        if (Math.min(audioRemainingMs, wallRemainingMs) > 0) {
          resetTargetDeadline(now)
          rafId = requestAnimationFrame(tick)
          return
        }
        expectedPulseRef.current = click?.isRunning() ? click.pulsesElapsed() : 0
        resetTargetDeadline(now)
        dispatch({ type: 'COUNT_IN_COMPLETE' })
        rafId = requestAnimationFrame(tick)
        return
      }

      if (now < actionLockUntilRef.current) {
        if (now >= targetDeadlineAt) {
          resetTargetDeadline(now)
          correctStableMs = 0
          wrongStableMs = 0
          wrongPitchClassRef.current = null
          releasingPitchClassRef.current = getDetectedPitchClass(
            readoutRef.current,
            current.config,
          )
          dispatch({ type: 'MISS', reason: 'timeout' })
        }
        rafId = requestAnimationFrame(tick)
        return
      }

      const readoutNow = readoutRef.current
      const target = current.targetPitchClass
      const timing = DIFFICULTY_TIMING[current.config.difficulty]
      const detectedPc = getDetectedPitchClass(readoutNow, current.config)

      // The previous note has stopped ringing once the pitch moves or drops out.
      if (releasingPitchClassRef.current !== detectedPc) {
        releasingPitchClassRef.current = null
      }
      const isReleasingPreviousNote = releasingPitchClassRef.current != null

      const startNextNote = (quality: 'perfect' | 'good') => {
        correctStableMs = 0
        wrongStableMs = 0
        resetTargetDeadline(now)
        actionLockUntilRef.current = now + timing.cooldownMs
        wrongPitchClassRef.current = null
        releasingPitchClassRef.current = detectedPc

        // Score the landing against the beat it was written on, then re-anchor
        // the expectation to where the player actually is.
        let placement: StaffJumperTiming = null
        let errorMs = 0
        if (clickRef.current?.isRunning()) {
          // Rhythm slots are in quarter-note units; the clock counts pulses.
          const pulseBeats = METERS[current.config!.meter].pulseBeats
          const heldPulses =
            getRhythmForStep(current.config!, current.sequenceStep).beats / pulseBeats
          const verdict = judgeTiming(
            clickRef.current.pulsesElapsed(),
            expectedPulseRef.current,
            heldPulses,
            current.config!.tempoBpm,
          )
          placement = verdict.placement
          errorMs = verdict.errorMs
          expectedPulseRef.current = verdict.nextExpectedPulse
        }

        dispatch({
          type: 'SUCCESS',
          quality,
          timing: placement,
          timingErrorMs: Math.round(errorMs),
        })
      }

      if (isReadoutCorrectPitch(readoutNow, target, current.config)) {
        wrongStableMs = 0
        wrongPitchClassRef.current = null
        correctStableMs += dt
        // A still-ringing note that matches the new target is a repeat, and
        // needs a longer hold before it counts — there was no fresh attack.
        const requiredMs = isReleasingPreviousNote ? REPEATED_NOTE_HOLD_MS : timing.correctMs
        if (correctStableMs >= requiredMs) {
          startNextNote(Math.abs(readoutNow.cents) <= 8 ? 'perfect' : 'good')
        }
      } else if (
        !isReleasingPreviousNote &&
        isReadoutWrongPitch(readoutNow, target, current.config)
      ) {
        correctStableMs = 0
        const wrongPc = detectedPc!
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
          // Hold the gate on the offending note so one sustained wrong pitch
          // costs a single heart instead of the whole run.
          releasingPitchClassRef.current = wrongPc
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
        // Whatever is sounding as the clock runs out belongs to the note that
        // just expired, not to the next one.
        releasingPitchClassRef.current = detectedPc
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

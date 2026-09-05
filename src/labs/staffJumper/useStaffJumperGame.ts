import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  getConcertTonicPitchClass,
  getDetectedPitchClass,
  getRhythmForStep,
  getTargetNoteAtStep,
  DIFFICULTY_TIMEOUT_SECONDS,
  isReadoutCorrectPitch,
  isReadoutWrongPitch,
  isRhythmMode,
  loadBestScore,
  measureStartStep,
  pitchClassesMatch,
  saveBestScore,
  type StaffJumperConfig,
  type StaffJumperState,
  type StaffJumperTiming,
} from './staffJumperMusicLogic'
import { durationMs, judgeTiming, lingerMs, METERS, secondsPerPulse } from './staffJumperRhythm'
import { clamp01 } from './staffJumperTravel'
import {
  attackWindowClosed,
  classifyHold,
  HOLD_DROPOUT_GRACE_MS,
  holdIsReported,
  identifyPlayedRhythm,
  judgeOnset,
  onsetWindowFor,
  PITCH_DETECTION_LATENCY_MS,
  slotDurationMs,
  unitMs as unitMsFor,
  writtenIoiUnits,
  type HoldQuality,
} from './staffJumperRhythmReading'
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
 * The player has moved on: the next written pitch is sounding, steadily, and
 * it is not the note they were just holding.
 *
 * Free play is paced by the player, so waiting out a dwell they have already
 * left is the run getting in their way. A repeated pitch is excluded because
 * there is no way to tell a fresh attack from the note still ringing.
 */
function nextNoteIsBeingPlayed(
  readout: PitchReadout,
  nextPitchClass: number,
  currentPitchClass: number,
  config: StaffJumperConfig,
  now: number,
  correctMs: number,
  onset: { pitchClass: number | null; startedAt: number },
): boolean {
  if (pitchClassesMatch(nextPitchClass, currentPitchClass)) return false
  if (!isReadoutCorrectPitch(readout, nextPitchClass, config)) return false
  if (onset.pitchClass == null || !pitchClassesMatch(onset.pitchClass, nextPitchClass)) return false
  return now - onset.startedAt >= correctMs
}

/**
 * One bar of clicks before the first note.
 *
 * A bar is enough in either meter now that the click ticks the subdivision
 * grid: four in 4/4, six in 6/8.
 */
const COUNT_IN_BARS = 1

/** Headroom for the audio context to resume before the count-in is timed out. */
const AUDIO_START_GRACE_MS = 700

const INITIAL_HEARTS = 3

let runSeedCounter = 0

/** A fresh, non-preview seed for every Start and Retry action. */
function createRunSeed(): number {
  runSeedCounter = (runSeedCounter + 1) >>> 0
  const entropy = new Uint32Array(1)
  globalThis.crypto?.getRandomValues?.(entropy)
  const randomPart = entropy[0] ?? Math.floor(Math.random() * 0x1_0000_0000)
  return (randomPart ^ (Date.now() >>> 0) ^ Math.imul(runSeedCounter, 0x9e3779b9)) >>> 0
}

type Action =
  | { type: 'START'; config: StaffJumperConfig }
  | {
      type: 'NOTE_ACCEPTED'
      quality: 'perfect' | 'good'
      timing: StaffJumperTiming
      timingErrorMs: number
      playedRhythmLabel?: string | null
    }
  | { type: 'NOTE_COMPLETE' }
  | { type: 'REST_COMPLETE' }
  /**
   * Rhythm mode's hop: the click has reached the next written onset, so the
   * run moves on whether or not the note that just ended was ever played.
   */
  | { type: 'RHYTHM_ADVANCE'; holdQuality: HoldQuality | null }
  | { type: 'MISS'; reason: 'wrong' | 'timeout' | 'missed-beat' }
  | { type: 'FALL_COMPLETE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RESTART'; config: StaffJumperConfig }
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
    earlyCount: 0,
    lateCount: 0,
    playedRhythmLabel: null,
    holdQuality: null,
    isCountingIn: false,
    isSustaining: false,
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

    /**
     * The written pitch has been recognised.
     *
     * Scoring, timing and feedback all happen here, at the attack, so the
     * player is told immediately that the note was right. The hop is *not*
     * here: the run lingers on this note for a beat proportional to its written
     * length first, which is what `isSustaining` marks.
     */
    case 'NOTE_ACCEPTED': {
      if (state.phase !== 'playing' || !state.config) return state
      const streak = state.streak + 1
      // Landing on the beat is worth an extra point — timing is a bonus, never
      // a penalty, so a late note still advances and still scores.
      const onTime = action.timing === 'on'
      return {
        ...state,
        score: state.score + (onTime ? 2 : 1),
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
        correctCount: state.correctCount + 1,
        onTimeCount: state.onTimeCount + (onTime ? 1 : 0),
        earlyCount: state.earlyCount + (action.timing === 'early' ? 1 : 0),
        lateCount: state.lateCount + (action.timing === 'late' ? 1 : 0),
        timing: action.timing,
        timingErrorMs: action.timingErrorMs,
        playedRhythmLabel: action.playedRhythmLabel ?? null,
        holdQuality: null,
        isSustaining: true,
        feedback: action.quality,
        feedbackToken: state.feedbackToken + 1,
      }
    }

    /**
     * The accepted note has been lingered on long enough — now hop.
     *
     * Nothing is scored a second time; this only moves the run on, which is
     * why a whole note and an eighth note are worth the same but hold the
     * player on the staff for noticeably different lengths of time.
     */
    case 'NOTE_COMPLETE': {
      if (state.phase !== 'playing' || !state.config || !state.isSustaining) return state
      const nextStep = state.sequenceStep + 1
      return {
        ...state,
        sequenceStep: nextStep,
        targetPitchClass: getTargetNoteAtStep(state.config, nextStep).pitchClass,
        advanceToken: state.advanceToken + 1,
        isSustaining: false,
      }
    }

    /**
     * A rest has been held for its written length.
     *
     * Silence is not something the player can get right or wrong, so this
     * advances the run without touching score, streak, hearts or accuracy — it
     * only moves the player onto the next slot and hops them across.
     */
    case 'REST_COMPLETE': {
      if (state.phase !== 'playing' || !state.config) return state
      const nextStep = state.sequenceStep + 1
      return {
        ...state,
        sequenceStep: nextStep,
        targetPitchClass: getTargetNoteAtStep(state.config, nextStep).pitchClass,
        advanceToken: state.advanceToken + 1,
        timing: null,
        timingErrorMs: 0,
        feedback: null,
      }
    }

    /**
     * The click reached the next note. Unlike `NOTE_COMPLETE` this does not
     * need the note to have been accepted: a missed beat still passes, exactly
     * as it would with a band playing on, and the player hops with it.
     */
    case 'RHYTHM_ADVANCE': {
      if (state.phase !== 'playing' || !state.config) return state
      const nextStep = state.sequenceStep + 1
      return {
        ...state,
        sequenceStep: nextStep,
        targetPitchClass: getTargetNoteAtStep(state.config, nextStep).pitchClass,
        advanceToken: state.advanceToken + 1,
        isSustaining: false,
        holdQuality: action.holdQuality,
      }
    }

    case 'MISS': {
      if (state.phase !== 'playing' || !state.config) return state
      const hearts = Math.max(0, state.hearts - 1)
      const feedback =
        action.reason === 'timeout'
          ? 'timeout'
          : action.reason === 'missed-beat'
            ? 'missed-beat'
            : 'wrong'
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
        isSustaining: false,
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
      // A note paused mid-linger has already scored, and the loop that was
      // timing the dwell died with the pause. Settle it here rather than
      // resuming into a dwell nothing is counting down, or re-judging a note
      // the player has already been paid for.
      const settledStep =
        state.isSustaining && state.config ? state.sequenceStep + 1 : state.sequenceStep
      // Rhythm mode takes it from the top of the bar, so the count-in leads
      // into a downbeat and the click's accents agree with the barlines. The
      // notes before the pause in that bar are read again and score again —
      // a few replayed notes are a small price for a restart that feels like
      // one a musician would make.
      const resumeStep =
        state.config && isRhythmMode(state.config)
          ? measureStartStep(state.config, settledStep)
          : settledStep
      const settled =
        state.config && resumeStep !== state.sequenceStep
          ? {
              ...state,
              sequenceStep: resumeStep,
              targetPitchClass: getTargetNoteAtStep(state.config, resumeStep).pitchClass,
              advanceToken: state.advanceToken + 1,
              isSustaining: false,
            }
          : { ...state, isSustaining: false }
      return {
        ...settled,
        phase: 'playing',
        pausedAtMs: null,
        // Resuming replays the count-in, so pitch is ignored until it lands.
        isCountingIn: true,
        timing: null,
        playedRhythmLabel: null,
        holdQuality: null,
        pausedDurationMs:
          state.pausedDurationMs +
          (state.pausedAtMs == null ? 0 : Math.max(0, resumedAt - state.pausedAtMs)),
      }
    }

    case 'RESTART':
      return reducer(
        { ...createInitialState(), config: action.config },
        { type: 'START', config: action.config },
      )

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
   * Rhythm mode's grid.
   *
   * Pulse 0 of the click is the onset of the step the count-in led into, so a
   * slot's position on the grid is its unit position minus this origin. Set
   * when a count-in begins; `wallOriginMs` is the wall-clock moment pulse 0
   * arrived, which stands in for the audio clock if the context is suspended.
   */
  const gridOriginRef = useRef({ units: 0, unitsIntoMeasure: 0, wallOriginMs: 0 })
  /**
   * When the pitch class currently sounding first appeared.
   *
   * The attack the rhythm is judged on: a pitch that stabilises 30 ms after it
   * first shows up was attacked 30 ms ago, not now, and a pitch that was
   * already sounding when the run reached its note was attacked early.
   */
  const pitchOnsetRef = useRef<{ pitchClass: number | null; startedAt: number }>({
    pitchClass: null,
    startedAt: 0,
  })
  /** Grid time and page position of the last accepted attack, for the spacing between notes. */
  const lastAttackRef = useRef<{ gridMs: number; unitPosition: number } | null>(null)
  const beatInBarRef = useRef<number | null>(null)
  /** Pulse within the bar the click is on, for the HUD's beat strip. Null with no clock. */
  const [beatInBar, setBeatInBar] = useState<number | null>(null)
  /**
   * 0 on the current notehead, 1 at the next. The renderer walks the character
   * along this; the loop is the clock, so the view only reads it.
   */
  const travelProgressRef = useRef(0)
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
    beatInBarRef.current = null
    setBeatInBar(null)
    travelProgressRef.current = 0
  }, [])

  const startAudio = useCallback((config: StaffJumperConfig) => {
    stopAudio()
    expectedPulseRef.current = 0

    const generation = audioGenerationRef.current
    const spec = METERS[config.meter]
    const countInMs =
      COUNT_IN_BARS * spec.pulsesPerMeasure * secondsPerPulse(config.tempoBpm) * 1000
    countInUntilMsRef.current = performance.now() + countInMs + AUDIO_START_GRACE_MS

    void startClickTrack({
      bpm: config.tempoBpm,
      soundId: 'classic',
      audible: config.metronome,
      countInBars: COUNT_IN_BARS,
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

  const resetAttackTracking = useCallback(() => {
    pitchOnsetRef.current = { pitchClass: null, startedAt: 0 }
    lastAttackRef.current = null
  }, [])

  const start = useCallback((config: StaffJumperConfig) => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    releasingPitchClassRef.current = null
    resetAttackTracking()
    resetNoteClock(DIFFICULTY_TIMEOUT_SECONDS[config.difficulty] * 1000)
    // Never inherit the setup preview's seed or a previous run's seed.
    const seeded = { ...config, sessionSeed: createRunSeed() }
    dispatch({ type: 'START', config: seeded })
    startAudio(seeded)
  }, [resetAttackTracking, resetNoteClock, startAudio])

  const restart = useCallback(() => {
    actionLockUntilRef.current = 0
    wrongPitchClassRef.current = null
    releasingPitchClassRef.current = null
    resetAttackTracking()
    const config = stateRef.current.config
    resetNoteClock(
      config
        ? DIFFICULTY_TIMEOUT_SECONDS[config.difficulty] * 1000
        : DIFFICULTY_TIMEOUT_SECONDS.medium * 1000,
    )
    if (config) {
      const seeded = { ...config, sessionSeed: createRunSeed() }
      dispatch({ type: 'RESTART', config: seeded })
      startAudio(seeded)
    }
  }, [resetAttackTracking, resetNoteClock, startAudio])

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
    resetAttackTracking()
    const config = stateRef.current.config
    dispatch({ type: 'RESUME' })
    // A fresh count-in re-establishes the tempo, and restarting the transport
    // re-anchors the beat clock so the first note back is judged from zero.
    if (config) startAudio(config)
  }, [resetAttackTracking, startAudio])

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
    } else if (
      state.feedback === 'wrong' ||
      state.feedback === 'timeout' ||
      state.feedback === 'missed-beat'
    ) {
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

    /**
     * Rests are read, not played.
     *
     * When the step the player is on is silence, the run simply waits out the
     * written length and moves on — no pitch is judged, the note clock cannot
     * expire, and nothing is scored either way.
     */
    const stepRhythm = getRhythmForStep(state.config!, state.sequenceStep)
    const stepMeter = METERS[state.config!.meter]
    const restMs = durationMs(stepRhythm.durationUnits, stepMeter, state.config!.tempoBpm)
    const restPulses = stepRhythm.durationUnits / stepMeter.pulseUnits
    let restEndsAt: number | null = null
    let restResolved = false

    /**
     * Rhythm mode — the click is the conductor.
     *
     * Each slot has an onset and an end on the click's grid. The step advances
     * when the grid reaches the slot's end, whatever the player did, so the
     * character walks a whole note for four beats and a rest for its full
     * length. The note itself must be attacked inside a window around its
     * onset (see staffJumperRhythmReading for how wide, and why), and after
     * the attack the pitch is followed only to report how long it was held.
     */
    const rhythmMode = isRhythmMode(state.config!)
    const bpm = state.config!.tempoBpm
    const pulseMs = secondsPerPulse(bpm) * 1000
    const perUnitMs = unitMsFor(stepMeter, bpm)
    const previousSlot =
      state.sequenceStep > 0 ? getRhythmForStep(state.config!, state.sequenceStep - 1) : null
    const onsetWindow = onsetWindowFor(stepRhythm, previousSlot, stepMeter, bpm)
    const writtenMs = slotDurationMs(stepRhythm, stepMeter, bpm)
    /** Attack settled — accepted, or given up on when its window closed. */
    let attackResolved = false
    let attackAccepted = false
    /** A wrong note already cost a heart here; the closing window must not cost another. */
    let heartLostOnThisNote = false
    let attackWallMs = 0
    let soundedUntilWallMs = 0
    let releasedAtWallMs: number | null = null
    let advanced = false

    // The grid is anchored to the step the count-in leads into.
    if (state.isCountingIn) {
      gridOriginRef.current = {
        units: stepRhythm.unitPosition,
        unitsIntoMeasure: stepRhythm.unitsIntoMeasure,
        wallOriginMs: countInUntilMsRef.current - AUDIO_START_GRACE_MS,
      }
      lastAttackRef.current = null
    }

    /** Milliseconds since pulse 0 — negative during the count-in. */
    const gridNowMs = (now: number) => {
      const click = clickRef.current
      if (click && click.isRunning()) return click.pulsesElapsed() * pulseMs
      return now - gridOriginRef.current.wallOriginMs
    }

    const publishBeat = (gridMs: number) => {
      const unitsIntoBar = gridMs / perUnitMs + gridOriginRef.current.unitsIntoMeasure
      const pulse = Math.floor(unitsIntoBar / stepMeter.pulseUnits)
      const beat =
        ((pulse % stepMeter.pulsesPerMeasure) + stepMeter.pulsesPerMeasure) %
        stepMeter.pulsesPerMeasure
      if (beatInBarRef.current !== beat) {
        beatInBarRef.current = beat
        setBeatInBar(beat)
      }
    }

    /**
     * Free play: when the accepted note stops lingering and the player hops on.
     *
     * Wall clock rather than the click's grid: with the metronome off the run
     * is paced by the player, not the transport, so this is a dwell — long
     * enough to feel the note's length — and not an attempt to land the hop on
     * the next beat. Rhythm mode never reads this; it hops on the grid.
     */
    let lingerUntilMs: number | null = null
    let lingerDurationMs = 0
    travelProgressRef.current = 0

    /**
     * The walk, published for the renderer.
     *
     * `handOver` has to zero it in the same breath as the advance dispatch,
     * not on the next pass of this effect: the view re-renders on the new step
     * before this loop is rebuilt, and a stale 1.0 read against the new step's
     * endpoints puts the character a whole note ahead for a frame. The loop
     * also keeps ticking until the teardown lands, so writes after the hand
     * over are ignored rather than resurrecting the note just finished.
     */
    let handedOver = false

    const setTravelProgress = (value: number) => {
      if (handedOver) return
      travelProgressRef.current = clamp01(value)
    }

    const handOver = () => {
      handedOver = true
      travelProgressRef.current = 0
    }

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

      // Note when the sounding pitch class began, count-in included: an attack
      // just ahead of the first beat is an early first note, not a non-event.
      const detectedNow = getDetectedPitchClass(readoutRef.current, current.config)
      if (pitchOnsetRef.current.pitchClass !== detectedNow) {
        pitchOnsetRef.current = { pitchClass: detectedNow, startedAt: now }
      }

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
        if (rhythmMode) publishBeat(gridNowMs(now))
        if (Math.min(audioRemainingMs, wallRemainingMs) > 0) {
          resetTargetDeadline(now)
          setTravelProgress(0)
          rafId = requestAnimationFrame(tick)
          return
        }
        expectedPulseRef.current = click?.isRunning() ? click.pulsesElapsed() : 0
        // Pulse 0 is now, by whichever clock got here first.
        gridOriginRef.current.wallOriginMs =
          now - (click?.isRunning() ? click.pulsesElapsed() * pulseMs : 0)
        resetTargetDeadline(now)
        dispatch({ type: 'COUNT_IN_COMPLETE' })
        rafId = requestAnimationFrame(tick)
        return
      }

      if (rhythmMode) {
        // The grid is the only clock here; the free-play timeout never runs.
        resetTargetDeadline(now)
        const gridMs = gridNowMs(now)
        publishBeat(gridMs)
        const slotOnsetMs = (stepRhythm.unitPosition - gridOriginRef.current.units) * perUnitMs
        const slotEndMs = slotOnsetMs + writtenMs
        const gridProgress = writtenMs > 0 ? (gridMs - slotOnsetMs) / writtenMs : 1
        const timing = DIFFICULTY_TIMING[current.config.difficulty]
        const readoutNow = readoutRef.current
        const target = current.targetPitchClass

        if (stepRhythm.isRest) {
          // Silence is read, not played: whatever sounds during a rest is
          // neither right nor wrong, and the run waits out the written length.
          setTravelProgress(gridProgress)
          if (!advanced && gridMs >= slotEndMs) {
            advanced = true
            handOver()
            releasingPitchClassRef.current = null
            wrongPitchClassRef.current = null
            dispatch({ type: 'REST_COMPLETE' })
          }
          rafId = requestAnimationFrame(tick)
          return
        }

        if (!attackResolved) {
          // The previous note has stopped ringing once the pitch moves or drops out.
          if (releasingPitchClassRef.current !== detectedNow) {
            releasingPitchClassRef.current = null
          }
          const isReleasingPreviousNote = releasingPitchClassRef.current != null

          if (isReadoutCorrectPitch(readoutNow, target, current.config)) {
            wrongStableMs = 0
            wrongPitchClassRef.current = null
            const soundingForMs = now - pitchOnsetRef.current.startedAt
            const requiredMs = isReleasingPreviousNote ? REPEATED_NOTE_HOLD_MS : timing.correctMs
            if (soundingForMs >= requiredMs) {
              // The attack is when the pitch first appeared, pulled back by the
              // detector's lag. A note already sounding when its slot arrived
              // was attacked early; it is credited from the window's edge at
              // the earliest, so nothing is ever judged against a beat that
              // belonged to a different note.
              const rawAttackGridMs = gridMs - soundingForMs - PITCH_DETECTION_LATENCY_MS
              const attackGridMs = Math.max(rawAttackGridMs, slotOnsetMs - onsetWindow.earlyMs)
              const errorMs = attackGridMs - slotOnsetMs
              const placement = judgeOnset(errorMs, onsetWindow)

              // Name the rhythm the spacing from the last attack produced.
              const lastAttack = lastAttackRef.current
              const played = lastAttack
                ? identifyPlayedRhythm(
                    attackGridMs - lastAttack.gridMs,
                    writtenIoiUnits(lastAttack, stepRhythm),
                    stepMeter,
                    bpm,
                  )
                : null
              lastAttackRef.current = { gridMs: attackGridMs, unitPosition: stepRhythm.unitPosition }

              attackResolved = true
              attackAccepted = true
              attackWallMs = now - soundingForMs
              soundedUntilWallMs = now
              releasingPitchClassRef.current = detectedNow
              dispatch({
                type: 'NOTE_ACCEPTED',
                quality: Math.abs(readoutNow.cents) <= 8 ? 'perfect' : 'good',
                timing: placement,
                timingErrorMs: Math.round(errorMs),
                playedRhythmLabel: played && !played.matchesWritten ? played.label : null,
              })
            }
          } else if (
            !isReleasingPreviousNote &&
            isReadoutWrongPitch(readoutNow, target, current.config)
          ) {
            const wrongPc = detectedNow!
            if (wrongPitchClassRef.current !== wrongPc) {
              wrongPitchClassRef.current = wrongPc
              wrongStableMs = 0
            }
            wrongStableMs += dt
            if (wrongStableMs >= timing.wrongMs && !heartLostOnThisNote) {
              // One heart for the wrong note; the window stays open so the
              // right note can still be found before the beat has gone.
              heartLostOnThisNote = true
              wrongStableMs = 0
              wrongPitchClassRef.current = null
              releasingPitchClassRef.current = wrongPc
              dispatch({ type: 'MISS', reason: 'wrong' })
            }
          } else {
            wrongStableMs = 0
            wrongPitchClassRef.current = null
          }

          // The window closing settles the note; so does the note ending, as a
          // backstop, so nothing can slip through unjudged.
          if (
            !attackResolved &&
            (attackWindowClosed(gridMs, slotOnsetMs, onsetWindow) || gridMs >= slotEndMs)
          ) {
            attackResolved = true
            // A wrong note still sounding as the beat passes is a wrong note,
            // not a missed one — that is what the player should be told.
            const wrongNoteSounding = wrongPitchClassRef.current != null
            wrongStableMs = 0
            wrongPitchClassRef.current = null
            // Whatever is sounding now belongs to the note that just went by.
            releasingPitchClassRef.current = detectedNow
            if (!heartLostOnThisNote) {
              heartLostOnThisNote = true
              dispatch({ type: 'MISS', reason: wrongNoteSounding ? 'wrong' : 'missed-beat' })
            }
          }
        } else if (attackAccepted && releasedAtWallMs == null) {
          // Follow the hold. A brief dropout is not a release; a real one is.
          if (detectedNow != null && pitchClassesMatch(detectedNow, target)) {
            soundedUntilWallMs = now
          } else if (now - soundedUntilWallMs > HOLD_DROPOUT_GRACE_MS) {
            releasedAtWallMs = soundedUntilWallMs
          }
        }

        // The click is the conductor, so the character walks with it whether or
        // not the note was played: where it stands is where the beat is. An
        // attack ahead of the beat is already credited from the window's edge
        // (see the attack branch above), so playing early moves the reader on
        // — it never moves the grid.
        setTravelProgress(gridProgress)

        // The click has reached the next written onset: hop, played or not.
        if (!advanced && gridMs >= slotEndMs) {
          advanced = true
          handOver()
          let holdQuality: HoldQuality | null = null
          if (attackAccepted && holdIsReported(stepRhythm, stepMeter)) {
            const soundedMs = (releasedAtWallMs ?? now) - attackWallMs
            holdQuality = classifyHold(soundedMs, writtenMs)
          }
          dispatch({ type: 'RHYTHM_ADVANCE', holdQuality })
        }

        rafId = requestAnimationFrame(tick)
        return
      }

      // A note that has been recognised and is now being lingered on. Nothing
      // is judged here: the pitch already scored at the attack, and the note
      // clock is held full so the dwell cannot expire into a miss.
      if (current.isSustaining) {
        resetTargetDeadline(now)
        const lingerProgress =
          lingerUntilMs == null || lingerDurationMs <= 0
            ? 1
            : 1 - (lingerUntilMs - now) / lingerDurationMs
        setTravelProgress(lingerProgress)
        const nextNote = getTargetNoteAtStep(current.config, current.sequenceStep + 1)
        // No window on this: the dwell exists to let a note breathe, and the
        // player starting the next one is the only signal that it has.
        const canTakeNext =
          lingerUntilMs != null &&
          !nextNote.isRest &&
          nextNoteIsBeingPlayed(
            readoutRef.current,
            nextNote.pitchClass,
            current.targetPitchClass,
            current.config,
            now,
            DIFFICULTY_TIMING[current.config.difficulty].correctMs,
            pitchOnsetRef.current,
          )
        // A null deadline means the loop was torn down and rebuilt mid-dwell;
        // there is nothing left to wait for, so hop rather than strand the run.
        if (lingerUntilMs == null || now >= lingerUntilMs || canTakeNext) {
          handOver()
          lingerUntilMs = null
          correctStableMs = 0
          wrongStableMs = 0
          actionLockUntilRef.current =
            now + DIFFICULTY_TIMING[current.config.difficulty].cooldownMs
          dispatch({ type: 'NOTE_COMPLETE' })
        }
        rafId = requestAnimationFrame(tick)
        return
      }

      if (stepRhythm.isRest) {
        // The clock is held full, exactly as during the count-in, so a rest can
        // never expire into a missed note.
        resetTargetDeadline(now)
        if (restEndsAt == null) restEndsAt = now + restMs
        const restProgress = restMs <= 0 ? 1 : 1 - (restEndsAt - now) / restMs
        setTravelProgress(restProgress)
        if (!restResolved && now >= restEndsAt) {
          restResolved = true
          handOver()
          actionLockUntilRef.current =
            now + DIFFICULTY_TIMING[current.config.difficulty].cooldownMs
          // Silence guarantees the next note is a fresh attack, so nothing is
          // left ringing for the release gate to hold back.
          releasingPitchClassRef.current = null
          wrongPitchClassRef.current = null
          expectedPulseRef.current += restPulses
          dispatch({ type: 'REST_COMPLETE' })
        }
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

      const acceptNote = (quality: 'perfect' | 'good') => {
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
          // Both duration and pulse length are exact sixteenth-note units.
          const pulseUnits = METERS[current.config!.meter].pulseUnits
          const heldPulses =
            getRhythmForStep(current.config!, current.sequenceStep).durationUnits / pulseUnits
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

        // Linger in proportion to what is written, so a whole note reads as
        // longer than an eighth without stalling the run for four beats.
        lingerUntilMs =
          now + lingerMs(stepRhythm.durationUnits, stepMeter, current.config!.tempoBpm)
        lingerDurationMs = lingerUntilMs - now

        dispatch({
          type: 'NOTE_ACCEPTED',
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
          acceptNote(Math.abs(readoutNow.cents) <= 8 ? 'perfect' : 'good')
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

  const getTravelProgress = useCallback(() => travelProgressRef.current, [])

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
    /** Rhythm mode: the pulse of the bar the click is on, 0-based; null without a running run. */
    beatInBar,
    getTravelProgress,
  }
}

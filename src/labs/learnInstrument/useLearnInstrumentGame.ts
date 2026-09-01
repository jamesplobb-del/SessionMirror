import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { AcceptedPitchFrame } from '../../hooks/useLivePitchTracker'
import { triggerSuccessHaptic } from '../../utils/haptics'
import { centsFromMidi } from '../../utils/pitchUtils'
import { canonicalInstrumentIdFromLesson, savePracticeGameInstrumentId } from '../practiceGameInstrument'
import {
  INSTRUMENTS,
  LESSON_GOALS,
  getInstrument,
  getLessonGoal,
  type Course,
  type GoalId,
  type LessonGoal,
  type Instrument,
  type InstrumentId,
  type LessonNote,
} from './instrumentData'

/**
 * How far out of tune the note may sit and still count as played.
 *
 * Rounding the detected pitch to the nearest semitone punishes a beginner who
 * is blowing sharp: forty cents high on the right note gets rounded onto the
 * note above and reported as wrong. Measuring the distance from the target
 * instead, with a wide window, means "sharp but recognisably this note" is
 * accepted. A genuine wrong note is a hundred cents away and still misses.
 */
export const MATCH_TOLERANCE_CENTS = 80

export const MATCH_HOLD_MS = 300
export const SUCCESS_DWELL_MS = 600

/**
 * Accepted pitch frames normally arrive every animation frame. A longer gap is
 * treated as a fresh attempt so two short sounds cannot add up to one hold.
 */
export const MAX_FRAME_GAP_MS = 80

export const LESSON_STORAGE_KEY = 'session-mirror.learn-instrument.v1'

export type LessonPhase = 'setup' | 'playing' | 'complete'
export type DetectedStatus =
  | 'idle'
  | 'listening'
  | 'wrong'
  | 'holding'
  | 'correct'

export interface LessonState {
  phase: LessonPhase
  instrumentId: InstrumentId
  goalId: GoalId
  /**
   * Positions into the instrument's note list, in the order this run asks for
   * them. The goal picks the order once at Start, so a shuffled run stays put
   * while it is being played.
   */
  order: readonly number[]
  targetIndex: number
  /**
   * Positions in `order` already played correctly. Tracked as a set rather
   * than a high-water mark because the student can step back and forth
   * through the lesson, and a note they have played should stay played.
   */
  completed: readonly number[]
  holdProgress: number
  detectedStatus: DetectedStatus
  detectedMidi: number | null
  detectedNoteName: string | null
  detectedCents: number | null
  /** Increments once per accepted note, making it useful as an animation key. */
  successToken: number
}

export type LessonTarget = LessonNote & {
  /** Sounding pitch. Octave is significant: this is not a pitch-class match. */
  concertMidi: number
}

export interface StoredProgressV1 {
  version: 1
  selectedInstrumentId: InstrumentId
  selectedGoalId: GoalId
  completedLessonIdsByInstrument: Record<string, string[]>
}

export interface UseLearnInstrumentGameOptions {
  initialInstrumentId?: string
  hapticFeedback?: boolean
}

export interface UseLearnInstrumentGameResult {
  state: LessonState
  instruments: readonly Instrument[]
  selectedInstrument: Instrument
  selectedGoal: LessonGoal
  /** The note list the chosen goal is running. */
  selectedCourse: Course
  /** The instrument's notes in the order this run asks for them. */
  targets: readonly LessonTarget[]
  currentTarget: LessonTarget | null
  completedTargetCount: number
  totalTargetCount: number
  detectedMessage: string
  completedLessonIds: readonly string[]
  completedLessonIdsByInstrument: Readonly<Record<string, readonly string[]>>
  completedCountByInstrument: Readonly<Record<string, number>>
  isCurrentLessonComplete: boolean
  /** Positions in `targets` already played correctly. */
  completedIndices: readonly number[]
  selectInstrument: (instrumentId: string) => void
  selectGoal: (goalId: string) => void
  goToNote: (targetIndex: number) => void
  goToPreviousNote: () => void
  goToNextNote: () => void
  /** Starts from note one. With no argument, uses the currently selected instrument. */
  start: (instrumentId?: string) => void
  restart: () => void
  backToSetup: () => void
  handleAcceptedPitchFrame: (frame: AcceptedPitchFrame | null) => void
}

type LessonAction =
  | { type: 'SELECT_INSTRUMENT'; instrumentId: InstrumentId }
  | { type: 'SELECT_GOAL'; goalId: GoalId }
  | { type: 'GO_TO'; targetIndex: number }
  | { type: 'START'; instrumentId: InstrumentId; goalId: GoalId; order: readonly number[] }
  | { type: 'BACK_TO_SETUP' }
  | {
      type: 'SET_DETECTION'
      status: Exclude<DetectedStatus, 'idle' | 'correct'>
      midi: number | null
      noteName: string | null
      cents: number | null
      holdProgress: number
    }
  | {
      type: 'NOTE_CORRECT'
      midi: number
      noteName: string
      cents: number
    }
  | { type: 'COMPLETE' }

interface HoldAttempt {
  startedAt: number | null
  lastMatchingFrameAt: number | null
}

const EMPTY_COMPLETED_LESSONS: Record<string, string[]> = {}

function defaultInstrumentId(): InstrumentId {
  return INSTRUMENTS[0]?.id ?? 'flute'
}

function defaultGoalId(): GoalId {
  return LESSON_GOALS[0].id
}

/** The note list a goal draws from — the first eight, or the whole range. */
function courseFor(instrument: Instrument, goalId: GoalId): Course {
  const goal = getLessonGoal(goalId) ?? LESSON_GOALS[0]
  return instrument.courses[goal.course]
}

function isKnownGoalId(goalId: string | undefined): goalId is GoalId {
  return Boolean(goalId && LESSON_GOALS.some((goal) => goal.id === goalId))
}

function resolveGoalId(goalId: string | undefined): GoalId {
  return isKnownGoalId(goalId) ? goalId : defaultGoalId()
}

/** Fisher-Yates, so "Mix them up" is a real shuffle rather than a rotation. */
function shuffledOrder(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[order[index], order[swap]] = [order[swap]!, order[index]!]
  }
  return order
}

function noteOrderFor(instrument: Instrument, goalId: GoalId): number[] {
  const goal = getLessonGoal(goalId) ?? LESSON_GOALS[0]
  const length = courseFor(instrument, goalId).notes.length
  return goal.order === 'shuffle'
    ? shuffledOrder(length)
    : Array.from({ length }, (_, index) => index)
}

function isKnownInstrumentId(
  instrumentId: string | undefined,
): instrumentId is InstrumentId {
  return Boolean(
    instrumentId && INSTRUMENTS.some((instrument) => instrument.id === instrumentId),
  )
}

function resolveInstrumentId(instrumentId: string | undefined): InstrumentId {
  return isKnownInstrumentId(instrumentId) ? instrumentId : defaultInstrumentId()
}

function createInitialState(instrumentId: InstrumentId, goalId: GoalId): LessonState {
  const instrument = getInstrument(instrumentId) ?? INSTRUMENTS[0]
  return {
    phase: 'setup',
    instrumentId,
    goalId,
    order: noteOrderFor(instrument, goalId),
    targetIndex: 0,
    completed: [],
    holdProgress: 0,
    detectedStatus: 'idle',
    detectedMidi: null,
    detectedNoteName: null,
    detectedCents: null,
    successToken: 0,
  }
}

function lessonReducer(
  state: LessonState,
  action: LessonAction,
): LessonState {
  switch (action.type) {
    case 'SELECT_INSTRUMENT':
      return createInitialState(action.instrumentId, state.goalId)

    case 'SELECT_GOAL':
      return createInitialState(state.instrumentId, action.goalId)

    case 'START':
      return {
        ...createInitialState(action.instrumentId, action.goalId),
        order: action.order,
        phase: 'playing',
        detectedStatus: 'listening',
        successToken: state.successToken,
      }

    case 'BACK_TO_SETUP':
      return {
        ...createInitialState(state.instrumentId, state.goalId),
        successToken: state.successToken,
      }

    case 'GO_TO': {
      if (state.phase !== 'playing') return state
      const targetIndex = Math.max(0, Math.min(action.targetIndex, state.order.length - 1))
      if (targetIndex === state.targetIndex && state.detectedStatus !== 'correct') return state
      return {
        ...state,
        targetIndex,
        holdProgress: 0,
        detectedStatus: 'listening',
        detectedMidi: null,
        detectedNoteName: null,
        detectedCents: null,
      }
    }

    case 'SET_DETECTION':
      if (state.phase !== 'playing' || state.detectedStatus === 'correct') return state
      return {
        ...state,
        detectedStatus: action.status,
        detectedMidi: action.midi,
        detectedNoteName: action.noteName,
        detectedCents: action.cents,
        holdProgress: action.holdProgress,
      }

    case 'NOTE_CORRECT':
      if (state.phase !== 'playing' || state.detectedStatus === 'correct') return state
      return {
        ...state,
        detectedStatus: 'correct',
        detectedMidi: action.midi,
        detectedNoteName: action.noteName,
        detectedCents: action.cents,
        holdProgress: 1,
        completed: state.completed.includes(state.targetIndex)
          ? state.completed
          : [...state.completed, state.targetIndex],
        successToken: state.successToken + 1,
      }

    case 'COMPLETE':
      if (state.phase !== 'playing' || state.detectedStatus !== 'correct') return state
      return { ...state, phase: 'complete' }
  }
}

function sanitizeCompletedLessons(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const completed: Record<string, string[]> = {}
  for (const [instrumentId, lessonIds] of Object.entries(value)) {
    if (!Array.isArray(lessonIds)) continue
    completed[instrumentId] = Array.from(
      new Set(lessonIds.filter((lessonId): lessonId is string => typeof lessonId === 'string')),
    )
  }
  return completed
}

export function loadLessonProgress(
  fallbackInstrumentId: string = defaultInstrumentId(),
): StoredProgressV1 {
  const fallback: StoredProgressV1 = {
    version: 1,
    selectedInstrumentId: resolveInstrumentId(fallbackInstrumentId),
    selectedGoalId: defaultGoalId(),
    completedLessonIdsByInstrument: EMPTY_COMPLETED_LESSONS,
  }

  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(LESSON_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<StoredProgressV1>
    return {
      version: 1,
      selectedInstrumentId: resolveInstrumentId(parsed.selectedInstrumentId),
      selectedGoalId: resolveGoalId(parsed.selectedGoalId),
      completedLessonIdsByInstrument: sanitizeCompletedLessons(
        parsed.completedLessonIdsByInstrument,
      ),
    }
  } catch {
    return fallback
  }
}

function saveLessonProgress(progress: StoredProgressV1): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LESSON_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Storage may be unavailable in private browsing; gameplay should continue.
  }
}

export function getConcertMidi(
  instrument: Instrument,
  note: LessonNote,
): number {
  return note.writtenMidi + instrument.transpositionSemitones
}

function getDetectedMessage(
  state: LessonState,
  currentTarget: LessonTarget | null,
): string {
  if (state.phase === 'setup') return 'Choose your instrument, then start the lesson.'
  if (state.phase === 'complete') return 'Lesson complete! You played every note.'
  if (!currentTarget) return 'Lesson complete!'

  switch (state.detectedStatus) {
    case 'idle':
    case 'listening':
      return `Play ${currentTarget.writtenLabel}`
    case 'wrong':
      return `Not quite — try ${currentTarget.writtenLabel}`
    case 'holding':
      return 'That is it — hold it steady…'
    case 'correct':
      return 'Great note!'
  }
}

export function useLearnInstrumentGame(
  options: UseLearnInstrumentGameOptions = {},
): UseLearnInstrumentGameResult {
  const initialProgressRef = useRef<StoredProgressV1 | null>(null)
  if (initialProgressRef.current === null) {
    initialProgressRef.current = loadLessonProgress(options.initialInstrumentId)
  }

  const initialProgress = initialProgressRef.current
  const initialInstrumentId = isKnownInstrumentId(initialProgress.selectedInstrumentId)
    ? initialProgress.selectedInstrumentId
    : resolveInstrumentId(options.initialInstrumentId)
  const [state, dispatch] = useReducer(
    lessonReducer,
    { instrumentId: initialInstrumentId, goalId: resolveGoalId(initialProgress.selectedGoalId) },
    (init) => createInitialState(init.instrumentId, init.goalId),
  )
  const stateRef = useRef(state)
  stateRef.current = state
  /** The goal in force right now, for callbacks that outlive a render. */
  const latestGoalId = useCallback(() => stateRef.current.goalId, [])

  const [completedLessonIdsByInstrument, setCompletedLessonIdsByInstrument] = useState<
    Record<string, string[]>
  >(() => initialProgress.completedLessonIdsByInstrument)
  const completedRef = useRef(completedLessonIdsByInstrument)
  completedRef.current = completedLessonIdsByInstrument

  const holdAttemptRef = useRef<HoldAttempt>({
    startedAt: null,
    lastMatchingFrameAt: null,
  })
  const successLockedRef = useRef(false)
  const dwellTimerRef = useRef<number | null>(null)

  const selectedInstrument =
    getInstrument(state.instrumentId) ?? INSTRUMENTS[0]
  const selectedGoal = getLessonGoal(state.goalId) ?? LESSON_GOALS[0]
  const selectedCourse = courseFor(selectedInstrument, state.goalId)
  const targets = useMemo<readonly LessonTarget[]>(
    () =>
      state.order
        .map((noteIndex) => selectedCourse.notes[noteIndex])
        .filter((note): note is LessonNote => Boolean(note))
        .map((note) => ({
          ...note,
          concertMidi: getConcertMidi(selectedInstrument, note),
        })),
    [selectedInstrument, state.order],
  )
  const currentTarget = targets[state.targetIndex] ?? null

  const clearDwellTimer = useCallback(() => {
    if (dwellTimerRef.current === null) return
    window.clearTimeout(dwellTimerRef.current)
    dwellTimerRef.current = null
  }, [])

  const resetHoldAttempt = useCallback(() => {
    holdAttemptRef.current.startedAt = null
    holdAttemptRef.current.lastMatchingFrameAt = null
  }, [])

  const resetLiveAttempt = useCallback(() => {
    clearDwellTimer()
    resetHoldAttempt()
    successLockedRef.current = false
  }, [clearDwellTimer, resetHoldAttempt])

  const persistSelection = useCallback((instrumentId: InstrumentId, goalId: GoalId) => {
    saveLessonProgress({
      version: 1,
      selectedInstrumentId: instrumentId,
      selectedGoalId: goalId,
      completedLessonIdsByInstrument: completedRef.current,
    })
    const canonicalId = canonicalInstrumentIdFromLesson(instrumentId)
    if (canonicalId) savePracticeGameInstrumentId(canonicalId)
  }, [])

  const completeLesson = useCallback((instrument: Instrument) => {
    const lessonId = courseFor(instrument, latestGoalId()).id
    const previous = completedRef.current
    const previousForInstrument = previous[instrument.id] ?? []
    if (previousForInstrument.includes(lessonId)) {
      persistSelection(instrument.id, stateRef.current.goalId)
      return
    }

    const next = {
      ...previous,
      [instrument.id]: [...previousForInstrument, lessonId],
    }
    completedRef.current = next
    setCompletedLessonIdsByInstrument(next)
    saveLessonProgress({
      version: 1,
      selectedInstrumentId: instrument.id,
      selectedGoalId: stateRef.current.goalId,
      completedLessonIdsByInstrument: next,
    })
  }, [persistSelection])

  const selectInstrument = useCallback(
    (instrumentId: string) => {
      if (!isKnownInstrumentId(instrumentId)) return
      resetLiveAttempt()
      persistSelection(instrumentId, stateRef.current.goalId)
      dispatch({ type: 'SELECT_INSTRUMENT', instrumentId })
    },
    [persistSelection, resetLiveAttempt],
  )

  const selectGoal = useCallback(
    (goalId: string) => {
      if (!isKnownGoalId(goalId)) return
      resetLiveAttempt()
      persistSelection(stateRef.current.instrumentId, goalId)
      dispatch({ type: 'SELECT_GOAL', goalId })
    },
    [persistSelection, resetLiveAttempt],
  )

  const start = useCallback(
    (instrumentId?: string) => {
      const nextInstrumentId = resolveInstrumentId(
        isKnownInstrumentId(instrumentId) ? instrumentId : stateRef.current.instrumentId,
      )
      const goalId = stateRef.current.goalId
      const instrument = getInstrument(nextInstrumentId) ?? INSTRUMENTS[0]
      resetLiveAttempt()
      persistSelection(nextInstrumentId, goalId)
      dispatch({
        type: 'START',
        instrumentId: nextInstrumentId,
        goalId,
        order: noteOrderFor(instrument, goalId),
      })
    },
    [persistSelection, resetLiveAttempt],
  )

  const restart = useCallback(() => {
    start(stateRef.current.instrumentId)
  }, [start])

  const backToSetup = useCallback(() => {
    resetLiveAttempt()
    dispatch({ type: 'BACK_TO_SETUP' })
  }, [resetLiveAttempt])

  /** Step to any note in the run without having to play the ones between. */
  const goToNote = useCallback(
    (targetIndex: number) => {
      const latest = stateRef.current
      if (latest.phase !== 'playing') return
      if (targetIndex < 0 || targetIndex >= latest.order.length) return
      resetLiveAttempt()
      dispatch({ type: 'GO_TO', targetIndex })
    },
    [resetLiveAttempt],
  )

  const goToPreviousNote = useCallback(() => {
    goToNote(stateRef.current.targetIndex - 1)
  }, [goToNote])

  const goToNextNote = useCallback(() => {
    goToNote(stateRef.current.targetIndex + 1)
  }, [goToNote])

  const scheduleAdvance = useCallback(
    (instrumentId: InstrumentId, targetIndex: number) => {
      clearDwellTimer()
      dwellTimerRef.current = window.setTimeout(() => {
        dwellTimerRef.current = null
        const latest = stateRef.current
        if (
          latest.phase !== 'playing' ||
          latest.detectedStatus !== 'correct' ||
          latest.instrumentId !== instrumentId ||
          latest.targetIndex !== targetIndex
        ) {
          return
        }

        const instrument = getInstrument(instrumentId) ?? INSTRUMENTS[0]
        resetHoldAttempt()
        successLockedRef.current = false

        // Walk forward from here — wrapping — to the first note still owed,
        // so stepping back to re-play an old note does not strand the lesson.
        const total = latest.order.length
        let nextIndex: number | null = null
        for (let step = 1; step <= total; step += 1) {
          const candidate = (targetIndex + step) % total
          if (!latest.completed.includes(candidate)) {
            nextIndex = candidate
            break
          }
        }

        if (nextIndex === null) {
          completeLesson(instrument)
          dispatch({ type: 'COMPLETE' })
        } else {
          dispatch({ type: 'GO_TO', targetIndex: nextIndex })
        }
      }, SUCCESS_DWELL_MS)
    },
    [clearDwellTimer, completeLesson, resetHoldAttempt],
  )

  const handleAcceptedPitchFrame = useCallback(
    (frame: AcceptedPitchFrame | null) => {
      const current = stateRef.current
      if (current.phase !== 'playing' || successLockedRef.current) return

      if (!frame) {
        resetHoldAttempt()
        dispatch({
          type: 'SET_DETECTION',
          status: 'listening',
          midi: null,
          noteName: null,
          cents: null,
          holdProgress: 0,
        })
        return
      }

      const instrument = getInstrument(current.instrumentId) ?? INSTRUMENTS[0]
      const noteIndex = current.order[current.targetIndex]
      const note = noteIndex == null ? undefined : courseFor(instrument, latestGoalId()).notes[noteIndex]
      if (!note) return

      const detectedMidi = Math.round(frame.readout.midi)
      const targetConcertMidi = getConcertMidi(instrument, note)
      // Measured against the target itself, not against the nearest semitone.
      // centsFromMidi answers 0 for a silent frame, so silence has to be ruled
      // out first or it would read as a perfectly in-tune note.
      const heardHz = frame.readout.frequencyHz
      const offCents = centsFromMidi(heardHz, targetConcertMidi)
      const onTarget =
        heardHz > 0 &&
        Number.isFinite(offCents) &&
        Math.abs(offCents) <= MATCH_TOLERANCE_CENTS
      if (!onTarget) {
        resetHoldAttempt()
        dispatch({
          type: 'SET_DETECTION',
          status: 'wrong',
          midi: detectedMidi,
          noteName: frame.readout.noteName,
          cents: frame.readout.cents,
          holdProgress: 0,
        })
        return
      }

      const attempt = holdAttemptRef.current
      const frameGap =
        attempt.lastMatchingFrameAt === null
          ? 0
          : frame.timestamp - attempt.lastMatchingFrameAt
      if (
        attempt.startedAt === null ||
        frameGap < 0 ||
        frameGap > MAX_FRAME_GAP_MS
      ) {
        attempt.startedAt = frame.timestamp
      }
      attempt.lastMatchingFrameAt = frame.timestamp

      const heldMs = Math.max(0, frame.timestamp - (attempt.startedAt ?? frame.timestamp))
      const holdProgress = Math.min(1, heldMs / MATCH_HOLD_MS)
      if (holdProgress < 1) {
        dispatch({
          type: 'SET_DETECTION',
          status: 'holding',
          midi: detectedMidi,
          noteName: frame.readout.noteName,
          cents: frame.readout.cents,
          holdProgress,
        })
        return
      }

      successLockedRef.current = true
      dispatch({
        type: 'NOTE_CORRECT',
        midi: detectedMidi,
        noteName: frame.readout.noteName,
        cents: frame.readout.cents,
      })
      triggerSuccessHaptic(options.hapticFeedback ?? true)
      scheduleAdvance(current.instrumentId, current.targetIndex)
    },
    [options.hapticFeedback, resetHoldAttempt, scheduleAdvance],
  )

  const completedLessonIds = completedLessonIdsByInstrument[state.instrumentId] ?? []
  const completedCountByInstrument = useMemo<Readonly<Record<string, number>>>(
    () =>
      Object.fromEntries(
        INSTRUMENTS.map((instrument) => [
          instrument.id,
          (completedLessonIdsByInstrument[instrument.id] ?? []).includes(courseFor(instrument, latestGoalId()).id)
            ? 1
            : 0,
        ]),
      ),
    [completedLessonIdsByInstrument],
  )
  const completedTargetCount = state.completed.length

  useEffect(() => clearDwellTimer, [clearDwellTimer])

  return {
    state,
    instruments: INSTRUMENTS,
    selectedInstrument,
    selectedGoal,
    selectedCourse,
    targets,
    currentTarget,
    completedTargetCount,
    totalTargetCount: targets.length,
    detectedMessage: getDetectedMessage(state, currentTarget),
    completedLessonIds,
    completedLessonIdsByInstrument,
    completedCountByInstrument,
    isCurrentLessonComplete: completedLessonIds.includes(selectedCourse.id),
    completedIndices: state.completed,
    selectInstrument,
    selectGoal,
    goToNote,
    goToPreviousNote,
    goToNextNote,
    start,
    restart,
    backToSetup,
    handleAcceptedPitchFrame,
  }
}

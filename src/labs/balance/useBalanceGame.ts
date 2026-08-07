import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import type { AcceptedPitchFrame } from '../../hooks/useLivePitchTracker'
import { triggerSuccessHaptic } from '../../utils/haptics'
import { startBalanceCountIn, startBalanceTone, type BalanceCountInHandle, type DroneHandle } from './balanceAudio'
import { balanceReducer, createBalanceState } from './balanceEngine'
import { buildBalanceTargets, getBalanceInstrument, routineSummary } from './balanceMusic'
import {
  addBalancePitchSample,
  BALANCE_DROPOUT_GRACE_MS,
  BALANCE_PITCH_LOCK_MS,
  centsFromConcertTarget,
  createBalanceScoreAccumulator,
  finalizeBalanceScore,
  isTargetPitch,
  movementSpeedForCents,
  type BalanceScoreAccumulator,
} from './balanceScoring'
import {
  getBalanceBestMs,
  loadBalanceData,
  recordBalanceResult,
  saveBalanceData,
  toleranceCentsForSettings,
} from './balanceStorage'
import type {
  BalanceCustomRoutine,
  BalanceRoutineResult,
  BalanceSettings,
  BalanceStoredDataV1,
  BalanceVisualSnapshot,
} from './balanceTypes'

const EMPTY_VISUAL: BalanceVisualSnapshot = {
  cents: 0,
  progress: 0,
  speed: 0,
  balancedMs: 0,
  confidentMs: 0,
  pitchPresent: false,
}

function waitMs(ms: number, timers: Set<number>): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer)
      resolve()
    }, ms)
    timers.add(timer)
  })
}

function createRoutineResult(
  state: ReturnType<typeof createBalanceState>,
  customRoutines: readonly BalanceCustomRoutine[],
): BalanceRoutineResult {
  const totalBalancedMs = state.noteResults.reduce((sum, result) => sum + result.balancedMs, 0)
  const totalConfidentMs = state.noteResults.reduce((sum, result) => sum + result.totalConfidentMs, 0)
  return {
    id: `${state.startedAt ?? Date.now()}-${state.targets.length}`,
    routineName: routineSummary(state.settings, customRoutines),
    startedAt: state.startedAt ?? Date.now(),
    completedAt: Date.now(),
    noteResults: state.noteResults,
    notesCompleted: state.noteResults.filter((result) => result.goalReached).length,
    totalBalancedMs,
    totalConfidentMs,
    centeredPercent: totalConfidentMs > 0 ? (totalBalancedMs / totalConfidentMs) * 100 : 0,
    completed:
      state.noteResults.length === state.targets.length &&
      state.noteResults.every((result) => result.goalReached),
  }
}

interface UseBalanceGameOptions {
  initialInstrumentId: string
  hapticFeedback: boolean
  onInstrumentChange: (settings: Pick<BalanceSettings, 'instrumentId'>) => void
}

export interface UseBalanceGameResult {
  state: ReturnType<typeof createBalanceState>
  data: BalanceStoredDataV1
  customRoutines: BalanceCustomRoutine[]
  visualRef: MutableRefObject<BalanceVisualSnapshot>
  hud: BalanceVisualSnapshot
  suppressUntilRef: MutableRefObject<number>
  toleranceCents: number
  currentTarget: ReturnType<typeof buildBalanceTargets>[number] | null
  routineResult: BalanceRoutineResult | null
  updateSettings: (patch: Partial<BalanceSettings>) => void
  start: () => void
  reset: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  retryNote: () => void
  continueAfterNote: () => void
  skipRest: () => void
  handleAcceptedPitchFrame: (frame: AcceptedPitchFrame | null) => void
  saveCustomRoutine: (routine: BalanceCustomRoutine) => void
  deleteCustomRoutine: (id: string) => void
}

export function useBalanceGame({
  initialInstrumentId,
  hapticFeedback,
  onInstrumentChange,
}: UseBalanceGameOptions): UseBalanceGameResult {
  const [data, setData] = useState(() => loadBalanceData(initialInstrumentId))
  const dataRef = useRef(data)
  dataRef.current = data
  const [state, dispatch] = useReducer(
    balanceReducer,
    undefined,
    () => createBalanceState(data.settings, getBalanceBestMs(data)),
  )
  const stateRef = useRef(state)
  stateRef.current = state
  const visualRef = useRef<BalanceVisualSnapshot>({ ...EMPTY_VISUAL })
  const [hud, setHud] = useState<BalanceVisualSnapshot>({ ...EMPTY_VISUAL })
  const suppressUntilRef = useRef(0)
  const accumulatorRef = useRef<BalanceScoreAccumulator | null>(null)
  const lockStartedAtRef = useRef<number | null>(null)
  const lastAcceptedAtRef = useRef(0)
  const toneRef = useRef<DroneHandle | null>(null)
  const countInRef = useRef<BalanceCountInHandle | null>(null)
  const resultPersistedRef = useRef<string | null>(null)

  const toleranceCents = toleranceCentsForSettings(state.settings)
  const currentTarget = state.targets[state.targetIndex] ?? null

  const stopTone = useCallback(() => {
    const tone = toneRef.current
    toneRef.current = null
    void tone?.stop()
  }, [])

  const clearAttempt = useCallback(() => {
    accumulatorRef.current = null
    lockStartedAtRef.current = null
    lastAcceptedAtRef.current = 0
    visualRef.current = { ...EMPTY_VISUAL }
    setHud({ ...EMPTY_VISUAL })
  }, [])

  const finishCurrentNote = useCallback(
    (goalReached: boolean) => {
      const accumulator = accumulatorRef.current
      if (!accumulator) return
      accumulatorRef.current = null
      const result = finalizeBalanceScore(accumulator, goalReached)
      stopTone()
      dispatch({ type: 'COMPLETE_NOTE', result })
      if (goalReached) triggerSuccessHaptic(hapticFeedback)
    },
    [hapticFeedback, stopTone],
  )

  const handleAcceptedPitchFrame = useCallback(
    (frame: AcceptedPitchFrame | null) => {
      if (!frame) {
        visualRef.current.pitchPresent = false
        return
      }

      const current = stateRef.current
      const target = current.targets[current.targetIndex]
      if (!target) return
      const cents = centsFromConcertTarget(
        frame.readout.midi,
        frame.readout.cents,
        target.concertMidi,
      )
      lastAcceptedAtRef.current = frame.timestamp
      visualRef.current.pitchPresent = true
      visualRef.current.cents = cents
      visualRef.current.speed = movementSpeedForCents(
        cents,
        toleranceCentsForSettings(current.settings),
      )

      if (current.phase === 'waitingForPitch') {
        if (!isTargetPitch(cents)) return
        lockStartedAtRef.current = frame.timestamp
        dispatch({ type: 'SET_PHASE', phase: 'pitchLock' })
        return
      }

      if (current.phase === 'pitchLock') {
        if (!isTargetPitch(cents)) {
          lockStartedAtRef.current = null
          dispatch({ type: 'SET_PHASE', phase: 'waitingForPitch' })
          return
        }
        const lockStartedAt = lockStartedAtRef.current ?? frame.timestamp
        lockStartedAtRef.current = lockStartedAt
        if (frame.timestamp - lockStartedAt < BALANCE_PITCH_LOCK_MS) return
        const accumulator = createBalanceScoreAccumulator(
          target,
          toleranceCentsForSettings(current.settings),
        )
        addBalancePitchSample(accumulator, { timestamp: frame.timestamp, centsFromTarget: cents })
        accumulatorRef.current = accumulator
        dispatch({ type: 'SET_PHASE', phase: 'active' })
        return
      }

      if (current.phase !== 'active') return
      const accumulator = accumulatorRef.current
      if (!accumulator) return
      addBalancePitchSample(accumulator, { timestamp: frame.timestamp, centsFromTarget: cents })
      const goalMs = current.settings.goalSeconds * 1000
      visualRef.current.balancedMs = accumulator.balancedMs
      visualRef.current.confidentMs = accumulator.totalConfidentMs
      visualRef.current.progress =
        current.settings.goalMode === 'personalBest'
          ? Math.min(0.94, accumulator.balancedMs / Math.max(goalMs, current.bestBalancedMs || goalMs))
          : Math.min(1, accumulator.balancedMs / goalMs)

      if (current.settings.goalMode === 'fixed' && accumulator.balancedMs >= goalMs) {
        finishCurrentNote(true)
      }
    },
    [finishCurrentNote],
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHud({ ...visualRef.current })
      const current = stateRef.current
      if (
        (current.phase === 'active' || current.phase === 'pitchLock') &&
        lastAcceptedAtRef.current > 0 &&
        Date.now() - lastAcceptedAtRef.current >= BALANCE_DROPOUT_GRACE_MS
      ) {
        if (current.phase === 'active') {
          const validPersonalBest =
            current.settings.goalMode === 'personalBest' &&
            (accumulatorRef.current?.balancedMs ?? 0) > 0
          finishCurrentNote(validPersonalBest)
        } else {
          lockStartedAtRef.current = null
          dispatch({ type: 'SET_PHASE', phase: 'waitingForPitch' })
        }
      }
      if (
        current.phase === 'resting' &&
        current.restEndsAt !== null &&
        Date.now() >= current.restEndsAt &&
        current.settings.soundRest.autoAdvance
      ) {
        clearAttempt()
        dispatch({ type: 'NEXT_NOTE' })
      }
    }, 80)
    return () => window.clearInterval(timer)
  }, [clearAttempt, finishCurrentNote])

  useEffect(() => {
    if (state.phase !== 'countIn' || !currentTarget) return
    let cancelled = false
    const timers = new Set<number>()

    const prepare = async () => {
      try {
        if (state.settings.soundRest.referencePitch || state.settings.soundRest.continuousDrone) {
          // useLivePitchTracker compares suppression deadlines with
          // performance.now(). A Date.now() deadline is many orders of
          // magnitude larger and would suppress the microphone indefinitely.
          suppressUntilRef.current = performance.now() + 1100
          const tone = await startBalanceTone(
            currentTarget.concertMidi,
            state.settings.soundRest.volume,
          )
          if (cancelled) {
            await tone.stop()
            return
          }
          toneRef.current = tone
          if (!state.settings.soundRest.continuousDrone) {
            await waitMs(780, timers)
            if (cancelled) return
            stopTone()
            await waitMs(180, timers)
          }
        }
        if (state.settings.soundRest.countIn && !cancelled) {
          const countIn = await startBalanceCountIn()
          if (cancelled) {
            countIn.stop()
            return
          }
          countInRef.current = countIn
          await countIn.done
          countInRef.current = null
        }
        if (!cancelled) dispatch({ type: 'SET_PHASE', phase: 'waitingForPitch' })
      } catch {
        if (!cancelled) dispatch({ type: 'ERROR', message: 'Reference audio could not start.' })
      }
    }
    void prepare()

    return () => {
      cancelled = true
      for (const timer of timers) window.clearTimeout(timer)
      timers.clear()
      countInRef.current?.stop()
      countInRef.current = null
    }
  }, [currentTarget, state.phase, state.settings.soundRest, stopTone])

  useEffect(() => {
    if (state.phase !== 'goalReached') return
    const timer = window.setTimeout(() => dispatch({ type: 'SET_PHASE', phase: 'noteResults' }), 700)
    return () => window.clearTimeout(timer)
  }, [state.phase])

  const continueAfterNote = useCallback(() => {
    const current = stateRef.current
    if (!current.currentResult) return
    if (current.targetIndex >= current.targets.length - 1) {
      dispatch({ type: 'NEXT_NOTE' })
      return
    }
    const rest = current.settings.soundRest.restDuration
    if (rest === 'manual') {
      dispatch({ type: 'SET_REST', endsAt: null })
      return
    }
    const seconds = rest === 'matchGoal' ? current.settings.goalSeconds : rest
    dispatch({ type: 'SET_REST', endsAt: Date.now() + seconds * 1000 })
  }, [])

  useEffect(() => {
    if (state.phase !== 'noteResults' || !state.currentResult?.goalReached) return
    const timer = window.setTimeout(continueAfterNote, 950)
    return () => window.clearTimeout(timer)
  }, [continueAfterNote, state.currentResult, state.phase])

  useEffect(() => {
    if (state.phase !== 'routineResults') return
    const result = createRoutineResult(state, dataRef.current.customRoutines)
    if (resultPersistedRef.current === result.id) return
    resultPersistedRef.current = result.id
    const next = recordBalanceResult(dataRef.current, result)
    dataRef.current = next
    setData(next)
    saveBalanceData(next)
    dispatch({ type: 'SET_BEST', bestBalancedMs: getBalanceBestMs(next) })
  }, [state])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopTone()
        countInRef.current?.stop()
        dispatch({ type: 'PAUSE' })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [stopTone])

  useEffect(() => {
    return () => {
      stopTone()
      countInRef.current?.stop()
    }
  }, [stopTone])

  const updateSettings = useCallback(
    (patch: Partial<BalanceSettings>) => {
      const current = stateRef.current.settings
      const settings = { ...current, ...patch }
      const next = { ...dataRef.current, settings }
      dataRef.current = next
      setData(next)
      saveBalanceData(next)
      dispatch({ type: 'UPDATE_SETTINGS', settings, bestBalancedMs: getBalanceBestMs(next) })
      if (patch.instrumentId) onInstrumentChange({ instrumentId: patch.instrumentId })
    },
    [onInstrumentChange],
  )

  const start = useCallback(() => {
    clearAttempt()
    resultPersistedRef.current = null
    const targets = buildBalanceTargets(stateRef.current.settings, dataRef.current.customRoutines)
    dispatch({ type: 'START', targets, bestBalancedMs: getBalanceBestMs(dataRef.current) })
  }, [clearAttempt])

  const reset = useCallback(() => {
    stopTone()
    clearAttempt()
    dispatch({ type: 'RESET' })
  }, [clearAttempt, stopTone])

  const pause = useCallback(() => {
    stopTone()
    dispatch({ type: 'PAUSE' })
  }, [stopTone])
  const resume = useCallback(() => dispatch({ type: 'RESUME' }), [])
  const stop = useCallback(() => {
    stopTone()
    dispatch({ type: 'STOP' })
  }, [stopTone])
  const retryNote = useCallback(() => {
    clearAttempt()
    dispatch({ type: 'RETRY_NOTE' })
  }, [clearAttempt])
  const skipRest = useCallback(() => {
    clearAttempt()
    dispatch({ type: 'NEXT_NOTE' })
  }, [clearAttempt])

  const saveCustomRoutine = useCallback((routine: BalanceCustomRoutine) => {
    const existing = dataRef.current.customRoutines.findIndex((item) => item.id === routine.id)
    const customRoutines = [...dataRef.current.customRoutines]
    if (existing >= 0) customRoutines[existing] = routine
    else customRoutines.push(routine)
    const settings = { ...dataRef.current.settings, selectedCustomRoutineId: routine.id }
    const next = { ...dataRef.current, customRoutines, settings }
    dataRef.current = next
    setData(next)
    saveBalanceData(next)
    dispatch({ type: 'UPDATE_SETTINGS', settings })
  }, [])

  const deleteCustomRoutine = useCallback((id: string) => {
    const customRoutines = dataRef.current.customRoutines.filter((routine) => routine.id !== id)
    const selectedCustomRoutineId =
      dataRef.current.settings.selectedCustomRoutineId === id
        ? customRoutines[0]?.id ?? null
        : dataRef.current.settings.selectedCustomRoutineId
    const settings = { ...dataRef.current.settings, selectedCustomRoutineId }
    const next = { ...dataRef.current, customRoutines, settings }
    dataRef.current = next
    setData(next)
    saveBalanceData(next)
    dispatch({ type: 'UPDATE_SETTINGS', settings })
  }, [])

  const routineResult = useMemo(
    () => (state.phase === 'routineResults' ? createRoutineResult(state, data.customRoutines) : null),
    [data.customRoutines, state],
  )

  return {
    state,
    data,
    customRoutines: data.customRoutines,
    visualRef,
    hud,
    suppressUntilRef,
    toleranceCents,
    currentTarget,
    routineResult,
    updateSettings,
    start,
    reset,
    pause,
    resume,
    stop,
    retryNote,
    continueAfterNote,
    skipRest,
    handleAcceptedPitchFrame,
    saveCustomRoutine,
    deleteCustomRoutine,
  }
}

export function balanceInstrumentSettings(id: string) {
  const instrument = getBalanceInstrument(id)
  return { tunerInstrument: instrument.tunerInstrument, tunerTransposition: instrument.transposition }
}

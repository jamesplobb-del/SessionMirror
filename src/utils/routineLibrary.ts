import { canUsePlus, requirePlus } from '../plus/plusAccess'
import { loadRoutine, parseRoutine, parseStep, type Routine, type RoutineStep } from './practiceRoutines'

const ROUTINES = 'besttake:routine-library:v1'
const EXERCISES = 'besttake:exercise-library:v1'
export interface SavedExercise { instrumentId: string | null; step: RoutineStep }

export function loadRoutineLibrary(): Routine[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(ROUTINES) ?? '[]')
    return Array.isArray(rows) ? rows.map(parseRoutine).filter((row): row is Routine => row !== null) : []
  } catch { return [] }
}

export const SHARED_ROUTINE_IDS_KEY = 'besttake:shared-routine-ids:v1'
function sharedRoutineIds(): string[] {
  try { const ids = JSON.parse(localStorage.getItem(SHARED_ROUTINE_IDS_KEY) ?? '[]'); return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [] } catch { return [] }
}
export function canSaveRoutine(routine: Routine, resume?: () => void): boolean {
  if (canUsePlus()) return true
  const shared = sharedRoutineIds()
  const active = loadRoutine()
  const existing = [...loadRoutineLibrary(), ...(active ? [active] : [])]
  if (shared.includes(routine.id) || existing.some(item => item.id === routine.id)) return true
  return !existing.some(item => !shared.includes(item.id)) || requirePlus('routines', resume)
}
export function storeLibraryRoutine(routine: Routine, options?: { shared: boolean }): void {
  if (options?.shared) localStorage.setItem(SHARED_ROUTINE_IDS_KEY, JSON.stringify([...new Set([...sharedRoutineIds(), routine.id])]))
  else if (!canSaveRoutine(routine)) throw new Error('Plus is required to save another routine.')
  const saved = loadRoutineLibrary()
  // Today can still hold the older version after an edit is saved to the
  // library but before the user taps Use. Do not overwrite that saved edit.
  if (saved.some(item => item.id === routine.id && item.updatedAt > routine.updatedAt)) return
  localStorage.setItem(ROUTINES, JSON.stringify([routine, ...saved.filter(item => item.id !== routine.id)]))
}

export function loadExerciseLibrary(): SavedExercise[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(EXERCISES) ?? '[]')
    if (!Array.isArray(rows)) return []
    return rows.flatMap(row => {
      if (!row || typeof row !== 'object') return []
      const step = parseStep(row.step)
      return step && (row.instrumentId === null || typeof row.instrumentId === 'string') ? [{ instrumentId: row.instrumentId, step }] : []
    })
  } catch { return [] }
}

export function storeLibraryExercise(exercise: SavedExercise): void {
  localStorage.setItem(EXERCISES, JSON.stringify([exercise, ...loadExerciseLibrary().filter(item => item.step.id !== exercise.step.id)]))
}

export class RoutineLibraryRecoveryError extends Error {}

/** Save one builder draft and its reusable exercises together, preserving the prior library on failure. */
export function storeLibraryRoutineWithExercises(routine: Routine, previousRoutine?: Routine | null): void {
  if (!canSaveRoutine(routine)) throw new Error('Plus is required to save another routine.')
  let routines = loadRoutineLibrary()
  // A stale Today copy must not overwrite the newer routine or its exercise setups.
  if (routines.some(item => item.id === routine.id && item.updatedAt > routine.updatedAt)) return
  const previous = previousRoutine?.id !== routine.id ? previousRoutine : null
  if (previous && !canSaveRoutine(previous)) throw new Error('Plus is required to save another routine.')
  for (const next of previous ? [previous, routine] : [routine]) {
    if (!routines.some(item => item.id === next.id && item.updatedAt > next.updatedAt)) {
      routines = [next, ...routines.filter(item => item.id !== next.id)]
    }
  }
  let exercises = loadExerciseLibrary()
  for (const step of routine.steps) {
    exercises = [{ instrumentId: routine.instrumentId, step }, ...exercises.filter(item => item.step.id !== step.id)]
  }
  const snapshots = new Map([ROUTINES, EXERCISES].map(key => [key, localStorage.getItem(key)]))
  const writes = [[EXERCISES, JSON.stringify(exercises)], [ROUTINES, JSON.stringify(routines)]]
  const mutated: string[] = []
  try {
    for (const [key, value] of writes) {
      if (snapshots.get(key) === value) continue
      localStorage.setItem(key, value)
      mutated.push(key)
    }
  } catch (cause) {
    let rollbackFailed = false
    for (const key of mutated.reverse()) {
      try {
        const value = snapshots.get(key)
        if (value == null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
      } catch { rollbackFailed = true }
    }
    if (rollbackFailed) throw new RoutineLibraryRecoveryError('Saving failed, and some previous library data could not be restored. Your draft is still here; keep this screen open and try saving again.')
    throw cause
  }
}

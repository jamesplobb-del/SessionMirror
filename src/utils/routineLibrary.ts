import { parseRoutine, parseStep, type Routine, type RoutineStep } from './practiceRoutines'

const ROUTINES = 'besttake:routine-library:v1'
const EXERCISES = 'besttake:exercise-library:v1'
export interface SavedExercise { instrumentId: string | null; step: RoutineStep }

export function loadRoutineLibrary(): Routine[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(ROUTINES) ?? '[]')
    return Array.isArray(rows) ? rows.map(parseRoutine).filter((row): row is Routine => row !== null) : []
  } catch { return [] }
}

export function storeLibraryRoutine(routine: Routine): void {
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

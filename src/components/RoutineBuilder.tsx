import type { TunerTranspositionId } from '../utils/tunerTransposition'
import type { DeskSnapshot } from '../utils/workspaceDesks'
import type { Routine, RoutineStepKind } from '../utils/practiceRoutines'
import type { Project } from '../db'

/** How the hub was asked to open the builder. */
export type RoutineBuilderMode = 'build' | 'presets' | 'edit'

export interface RoutineBuilderProps {
  mode: RoutineBuilderMode
  routine: Routine | null
  instrumentId: string | null
  projects: Project[]
  liveDeskSnapshot: DeskSnapshot
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  onSave: (routine: Routine) => void
  /** Show a received music routine in the music-first lineup. */
  onOpenSharedRoutine?: (routine: Routine) => void
  /**
   * Binds a step to its own practice folder on demand — the moment music is
   * chosen for a step that does not have one yet.
   */
  onCreatePracticeItem: (title: string) => Promise<string>
  /** Saves, then opens the routine's next step straight away. */
  onSaveAndStart?: (routine: Routine) => void | Promise<void>
  /** Today's session of this routine has begun, so Start reads as Continue. */
  todayStarted?: boolean
  onDelete: () => void
  onCancel: () => void
}

export function kindNeedsDesk(kind: RoutineStepKind): boolean {
  return kind !== 'game' && kind !== 'free'
}

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
  /** Start a new routine by choosing music. */
  onStartMusicRoutine?: () => void
  /** Open a saved or imported routine in the music-first lineup. */
  onOpenMusicRoutine?: (routine: Routine) => void
  /**
   * Binds a step to its own practice folder on demand — the moment music is
   * chosen for a step that does not have one yet.
   */
  onCreatePracticeItem: (title: string) => Promise<string>
  /** Opens the existing Music Library from the routines landing page. */
  onOpenMusicLibrary?: () => void
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

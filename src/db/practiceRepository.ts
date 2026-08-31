import { getVaultDatabase, persistVaultWebStore } from './connection'
import type {
  PracticeComparisonMode,
  PracticeItemState,
  PracticeSession,
} from './types'

type SqlRow = Record<string, unknown>

function comparisonMode(value: unknown): PracticeComparisonMode {
  return value === 'previous-take' || value === 'yesterday' || value === 'reference-track'
    ? value
    : 'current-best'
}

function mapState(row: SqlRow): PracticeItemState {
  return {
    projectId: String(row.project_id),
    focusArea: String(row.focus_area ?? ''),
    comparison: comparisonMode(row.comparison_mode),
    loopStartSeconds:
      row.loop_start_seconds === null || row.loop_start_seconds === undefined
        ? null
        : Number(row.loop_start_seconds),
    loopEndSeconds:
      row.loop_end_seconds === null || row.loop_end_seconds === undefined
        ? null
        : Number(row.loop_end_seconds),
    pendingIntention: String(row.pending_intention ?? ''),
    lastSessionId: row.last_session_id ? String(row.last_session_id) : null,
    lastOpenedAt: Number(row.last_opened_at ?? 0),
  }
}

function mapSession(row: SqlRow): PracticeSession {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    startedAt: Number(row.started_at),
    endedAt: row.ended_at === null || row.ended_at === undefined ? null : Number(row.ended_at),
    focusArea: String(row.focus_area ?? ''),
    comparison: comparisonMode(row.comparison_mode),
  }
}

export async function listPracticeItemStates(): Promise<PracticeItemState[]> {
  const db = getVaultDatabase()
  const result = await db.query(
    'SELECT * FROM practice_item_states ORDER BY last_opened_at DESC',
  )
  return (result.values ?? []).map((row) => mapState(row as SqlRow))
}

export async function getPracticeItemState(
  projectId: string,
): Promise<PracticeItemState | null> {
  const db = getVaultDatabase()
  const result = await db.query(
    'SELECT * FROM practice_item_states WHERE project_id = ? LIMIT 1',
    [projectId],
  )
  const row = result.values?.[0] as SqlRow | undefined
  return row ? mapState(row) : null
}

export async function startPracticeSession(options: {
  projectId: string
  focusArea: string
  comparison: PracticeComparisonMode
}): Promise<{ session: PracticeSession; state: PracticeItemState }> {
  const db = getVaultDatabase()
  const now = Date.now()
  const session: PracticeSession = {
    id: crypto.randomUUID(),
    projectId: options.projectId,
    startedAt: now,
    endedAt: null,
    focusArea: options.focusArea.trim(),
    comparison: options.comparison,
  }

  await db.executeSet(
    [
      {
        statement: `INSERT INTO practice_sessions
          (id, project_id, started_at, ended_at, focus_area, comparison_mode)
          VALUES (?, ?, ?, NULL, ?, ?)`,
        values: [
          session.id,
          session.projectId,
          session.startedAt,
          session.focusArea,
          session.comparison,
        ],
      },
      {
        statement: `INSERT INTO practice_item_states
          (project_id, focus_area, comparison_mode, pending_intention, last_session_id, last_opened_at)
          VALUES (?, ?, ?, '', ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET
            focus_area = excluded.focus_area,
            comparison_mode = excluded.comparison_mode,
            last_session_id = excluded.last_session_id,
            last_opened_at = excluded.last_opened_at`,
        values: [
          session.projectId,
          session.focusArea,
          session.comparison,
          session.id,
          now,
        ],
      },
    ],
    true,
  )
  await persistVaultWebStore()
  return {
    session,
    state: (await getPracticeItemState(session.projectId))!,
  }
}

/** Closes out one sitting — "done for now" in the record/reflect loop. */
export async function endPracticeSession(sessionId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.run('UPDATE practice_sessions SET ended_at = ? WHERE id = ?', [
    Date.now(),
    sessionId,
  ])
  await persistVaultWebStore()
}

export async function resumePracticeSession(projectId: string): Promise<PracticeItemState | null> {
  const db = getVaultDatabase()
  const now = Date.now()
  await db.run(
    'UPDATE practice_item_states SET last_opened_at = ? WHERE project_id = ?',
    [now, projectId],
  )
  await persistVaultWebStore()
  return getPracticeItemState(projectId)
}

export async function updatePracticeItemState(
  projectId: string,
  updates: Partial<
    Pick<
      PracticeItemState,
      | 'focusArea'
      | 'comparison'
      | 'loopStartSeconds'
      | 'loopEndSeconds'
      | 'pendingIntention'
      | 'lastOpenedAt'
    >
  >,
): Promise<PracticeItemState> {
  const db = getVaultDatabase()
  const current =
    (await getPracticeItemState(projectId)) ??
    ({
      projectId,
      focusArea: '',
      comparison: 'current-best',
      loopStartSeconds: null,
      loopEndSeconds: null,
      pendingIntention: '',
      lastSessionId: null,
      lastOpenedAt: Date.now(),
    } satisfies PracticeItemState)
  const next = { ...current, ...updates }
  await db.run(
    `INSERT INTO practice_item_states
      (project_id, focus_area, comparison_mode, loop_start_seconds, loop_end_seconds,
       pending_intention, last_session_id, last_opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       focus_area = excluded.focus_area,
       comparison_mode = excluded.comparison_mode,
       loop_start_seconds = excluded.loop_start_seconds,
       loop_end_seconds = excluded.loop_end_seconds,
       pending_intention = excluded.pending_intention,
       last_session_id = excluded.last_session_id,
       last_opened_at = excluded.last_opened_at`,
    [
      next.projectId,
      next.focusArea,
      next.comparison,
      next.loopStartSeconds,
      next.loopEndSeconds,
      next.pendingIntention,
      next.lastSessionId,
      next.lastOpenedAt,
    ],
  )
  await persistVaultWebStore()
  return next
}

export async function listPracticeSessions(projectId: string): Promise<PracticeSession[]> {
  const db = getVaultDatabase()
  const result = await db.query(
    'SELECT * FROM practice_sessions WHERE project_id = ? ORDER BY started_at DESC',
    [projectId],
  )
  return (result.values ?? []).map((row) => mapSession(row as SqlRow))
}

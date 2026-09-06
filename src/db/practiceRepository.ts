import { getVaultDatabase, persistVaultWebStore } from './connection'
import type {
  PracticeComparisonMode,
  PracticeItemState,
  PracticeSession,
  Project,
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
    routineId: row.routine_id ? String(row.routine_id) : null,
    routineStepId: row.routine_step_id ? String(row.routine_step_id) : null,
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
  routineId?: string | null
  routineStepId?: string | null
  /** Only this explicit, still-open sitting may be resumed. */
  resumeSessionId?: string | null
  replaceSessionId?: string | null
}): Promise<{ session: PracticeSession; state: PracticeItemState }> {
  const db = getVaultDatabase()
  const now = Date.now()
  // A crash between SQLite commit and the routine checkpoint must not create
  // a second sitting when the musician retries opening the same item today.
  let resumeId = options.resumeSessionId
  if (options.routineId && options.routineStepId) {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
    const open = await db.query(`SELECT id FROM practice_sessions WHERE project_id = ? AND routine_id = ?
      AND routine_step_id = ? AND ended_at IS NULL AND started_at >= ? ORDER BY started_at DESC LIMIT 1`,
    [options.projectId, options.routineId, options.routineStepId, midnight.getTime()])
    resumeId = open.values?.[0]?.id ? String(open.values[0].id) : resumeId
  }
  if (resumeId) {
    const result = await db.query('SELECT * FROM practice_sessions WHERE id = ? AND project_id = ? AND ended_at IS NULL',
      [resumeId, options.projectId])
    const row = result.values?.[0] as SqlRow | undefined
    if (row && (row.routine_id ?? null) === (options.routineId ?? null) &&
        (row.routine_step_id ?? null) === (options.routineStepId ?? null)) {
      const session = mapSession(row)
      await db.executeSet([
        { statement: 'UPDATE practice_sessions SET ended_at = ? WHERE id = ? AND id <> ? AND ended_at IS NULL',
          values: [now, options.replaceSessionId ?? '', session.id] },
        { statement: 'UPDATE practice_item_states SET last_session_id = ?, last_opened_at = ? WHERE project_id = ?',
          values: [session.id, now, session.projectId] },
      ], true)
      await persistVaultWebStore()
      return { session, state: (await getPracticeItemState(session.projectId))! }
    }
  }
  const session: PracticeSession = {
    routineId: options.routineId ?? null,
    routineStepId: options.routineStepId ?? null,
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
        statement: 'UPDATE practice_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL',
        values: [now, options.replaceSessionId ?? ''],
      },
      {
        statement: `INSERT INTO practice_sessions
          (id, project_id, started_at, ended_at, focus_area, comparison_mode, routine_id, routine_step_id)
          VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
        values: [
          session.id,
          session.projectId,
          session.startedAt,
          session.focusArea,
          session.comparison,
          session.routineId,
          session.routineStepId,
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
  await db.run('UPDATE practice_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL', [
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
  const fields = {
    focusArea: 'focus_area', comparison: 'comparison_mode', loopStartSeconds: 'loop_start_seconds',
    loopEndSeconds: 'loop_end_seconds', pendingIntention: 'pending_intention', lastOpenedAt: 'last_opened_at',
  } as const
  const entries = Object.entries(fields).flatMap(([key, column]) => {
    const value = updates[key as keyof typeof fields]
    return value === undefined ? [] : [{ column, value }]
  })
  await db.executeSet([
    { statement: `INSERT INTO practice_item_states (project_id, last_opened_at) VALUES (?, ?)
        ON CONFLICT(project_id) DO NOTHING`, values: [projectId, Date.now()] },
    ...(entries.length ? [{
      statement: `UPDATE practice_item_states SET ${entries.map(entry => `${entry.column} = ?`).join(', ')} WHERE project_id = ?`,
      values: [...entries.map(entry => entry.value), projectId],
    }] : []),
  ], true)
  await persistVaultWebStore()
  return (await getPracticeItemState(projectId))!
}

export async function listPracticeSessions(projectId: string): Promise<PracticeSession[]> {
  const db = getVaultDatabase()
  const result = await db.query(
    'SELECT * FROM practice_sessions WHERE project_id = ? ORDER BY started_at DESC',
    [projectId],
  )
  return (result.values ?? []).map((row) => mapSession(row as SqlRow))
}

/** Counts saved media, including zero-take tool sessions. No inferred quality score. */
export async function summarizePracticeSessions(sessionIds: string[]): Promise<{ attempts: number; recordedSeconds: number; bestTakes: number }> {
  const ids = [...new Set(sessionIds)]
  const summary = { attempts: 0, recordedSeconds: 0, bestTakes: 0 }
  const db = getVaultDatabase()
  // Stay below SQLite's parameter limit even on a long practice day.
  for (let offset = 0; offset < ids.length; offset += 200) {
    const chunk = ids.slice(offset, offset + 200)
    const result = await db.query(`SELECT COUNT(*) AS attempts, COALESCE(SUM(duration), 0) AS seconds,
      COALESCE(SUM(is_best_take), 0) AS best FROM takes WHERE practice_session_id IN (${chunk.map(() => '?').join(',')})`, chunk)
    const row = result.values?.[0]
    summary.attempts += Number(row?.attempts ?? 0)
    summary.recordedSeconds += Number(row?.seconds ?? 0)
    summary.bestTakes += Number(row?.best ?? 0)
  }
  return summary
}

/** Recover bindings from committed sittings when local routine storage missed its last write. */
export async function findRoutinePracticeProject(routineId: string, stepId: string, projectId: string | null): Promise<Project | null> {
  const db = getVaultDatabase()
  const result = projectId
    ? await db.query('SELECT id, name, created_at FROM projects WHERE id = ?', [projectId])
    : await db.query(`SELECT p.id, p.name, p.created_at FROM projects p JOIN practice_sessions s ON s.project_id = p.id
        WHERE s.routine_id = ? AND s.routine_step_id = ? ORDER BY s.started_at DESC LIMIT 1`, [routineId, stepId])
  const row = result.values?.[0]
  return row ? { id: String(row.id), name: String(row.name), createdAt: Number(row.created_at) } : null
}

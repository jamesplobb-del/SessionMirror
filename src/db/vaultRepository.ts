import { getVaultDatabase, persistVaultWebStore } from './connection'
import type {
  BestTakeHistoryEntry,
  Project,
  SaveTakeInput,
  VaultTake,
  VaultTakeUpdate,
} from './types'

type SqlRow = Record<string, unknown>

function parsePitchSeries(value: unknown): VaultTake['pitchSeries'] {
  if (typeof value !== 'string' || !value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return undefined
    const samples = parsed
      .map((sample) => {
        if (!sample || typeof sample !== 'object') return null
        const row = sample as Record<string, unknown>
        const time = Number(row.time)
        const frequencyHz = Number(row.frequencyHz)
        return Number.isFinite(time) && Number.isFinite(frequencyHz) && frequencyHz > 0
          ? { time, frequencyHz }
          : null
      })
      .filter((sample): sample is { time: number; frequencyHz: number } => sample !== null)
    return samples.length > 0 ? samples : undefined
  } catch {
    return undefined
  }
}

function mapProjectRow(row: SqlRow): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: Number(row.created_at),
  }
}

function mapTakeRow(row: SqlRow): VaultTake {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    filePath: String(row.file_path),
    duration: Number(row.duration),
    isBestTake: Number(row.is_best_take) === 1,
    createdAt: Number(row.created_at),
    name: String(row.name ?? ''),
    mimeType: String(row.mime_type ?? 'video/mp4'),
    mediaType: String(row.media_type ?? 'video') === 'audio' ? 'audio' : 'video',
    rating: Number(row.rating ?? 0),
    notes: String(row.notes ?? ''),
    recordingOrientation:
      String(row.recording_orientation ?? 'portrait') === 'landscape'
        ? 'landscape'
        : 'portrait',
    enhancerBaked: Number(row.enhancer_baked ?? 0) === 1,
    timelineOffsetMs: Number(row.timeline_offset_ms ?? 0),
    practiceSessionId: row.practice_session_id ? String(row.practice_session_id) : undefined,
    intention: String(row.intention ?? ''),
    pitchSeries: parsePitchSeries(row.pitch_series_json),
    performanceStartSeconds:
      row.performance_start_seconds === null || row.performance_start_seconds === undefined
        ? undefined
        : Number(row.performance_start_seconds),
  }
}

function mapBestTakeHistoryRow(row: SqlRow): BestTakeHistoryEntry {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    projectName: String(row.project_name ?? ''),
    takeId: String(row.take_id),
    takeName: String(row.take_name ?? ''),
    markedAt: Number(row.marked_at),
    takeCreatedAt: Number(row.take_created_at),
    duration: Number(row.duration ?? 0),
    mediaType: String(row.media_type ?? 'video') === 'audio' ? 'audio' : 'video',
    isCurrentBest: Number(row.is_current_best) === 1,
  }
}

async function persistWebStore(): Promise<void> {
  await persistVaultWebStore()
}

export async function createProject(name: string): Promise<Project> {
  const db = getVaultDatabase()
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Project name cannot be empty.')
  }

  const project: Project = {
    id: crypto.randomUUID(),
    name: trimmed,
    createdAt: Date.now(),
  }

  await db.run('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)', [
    project.id,
    project.name,
    project.createdAt,
  ])

  await persistWebStore()
  return project
}

export async function listProjects(): Promise<Project[]> {
  const db = getVaultDatabase()
  const result = await db.query('SELECT * FROM projects ORDER BY created_at DESC')
  return (result.values ?? []).map((row) => mapProjectRow(row as SqlRow))
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.run('DELETE FROM projects WHERE id = ?', [projectId])
  await persistWebStore()
}

export async function saveTake(input: SaveTakeInput): Promise<VaultTake> {
  const db = getVaultDatabase()
  const trimmedPath = input.filePath.trim()
  if (!trimmedPath) {
    throw new Error('Take file path cannot be empty.')
  }

  const projectCheck = await db.query('SELECT id FROM projects WHERE id = ? LIMIT 1', [
    input.projectId,
  ])
  if ((projectCheck.values ?? []).length === 0) {
    throw new Error(`Project not found: ${input.projectId}`)
  }

  const take: VaultTake = {
    id: input.takeId ?? crypto.randomUUID(),
    projectId: input.projectId,
    filePath: trimmedPath,
    duration: Math.max(0, Math.round(input.duration)),
    isBestTake: false,
    createdAt: Date.now(),
    name: input.name?.trim() ?? '',
    mimeType: input.mimeType ?? 'video/mp4',
    mediaType: input.mediaType ?? 'video',
    rating: 0,
    notes: '',
    recordingOrientation: input.recordingOrientation ?? 'portrait',
    enhancerBaked: false,
    timelineOffsetMs: input.timelineOffsetMs ?? 0,
    practiceSessionId: input.practiceSessionId,
    intention: input.intention?.trim() ?? '',
    pitchSeries: input.pitchSeries,
    performanceStartSeconds: input.performanceStartSeconds,
  }

  await db.run(
    `INSERT INTO takes (
      id, project_id, file_path, duration, is_best_take, created_at,
      name, mime_type, media_type, rating, notes, recording_orientation, enhancer_baked,
      timeline_offset_ms, practice_session_id, intention, pitch_series_json,
      performance_start_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      take.id,
      take.projectId,
      take.filePath,
      take.duration,
      take.isBestTake ? 1 : 0,
      take.createdAt,
      take.name,
      take.mimeType,
      take.mediaType,
      take.rating,
      take.notes,
      take.recordingOrientation ?? 'portrait',
      0,
      take.timelineOffsetMs ?? 0,
      take.practiceSessionId ?? null,
      take.intention,
      take.pitchSeries ? JSON.stringify(take.pitchSeries) : '',
      take.performanceStartSeconds ?? null,
    ],
  )

  await persistWebStore()
  return take
}

export async function updateVaultTake(takeId: string, updates: VaultTakeUpdate): Promise<void> {
  const db = getVaultDatabase()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.rating !== undefined) {
    fields.push('rating = ?')
    values.push(updates.rating)
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?')
    values.push(updates.notes)
  }
  if (updates.timelineOffsetMs !== undefined) {
    fields.push('timeline_offset_ms = ?')
    values.push(Math.round(updates.timelineOffsetMs))
  }
  if (updates.intention !== undefined) {
    fields.push('intention = ?')
    values.push(updates.intention)
  }
  if (updates.pitchSeries !== undefined) {
    fields.push('pitch_series_json = ?')
    values.push(JSON.stringify(updates.pitchSeries))
  }
  if (updates.performanceStartSeconds !== undefined) {
    fields.push('performance_start_seconds = ?')
    values.push(updates.performanceStartSeconds)
  }

  if (fields.length === 0) return

  values.push(takeId)
  await db.run(`UPDATE takes SET ${fields.join(', ')} WHERE id = ?`, values)
  await persistWebStore()
}

/** Flip after the native renderer atomically replaced the file with the enhanced version. */
export async function setTakeEnhancerBaked(takeId: string, baked: boolean): Promise<void> {
  const db = getVaultDatabase()
  await db.run('UPDATE takes SET enhancer_baked = ? WHERE id = ?', [baked ? 1 : 0, takeId])
  await persistWebStore()
}

export async function deleteVaultTake(takeId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.run('DELETE FROM takes WHERE id = ?', [takeId])
  await persistWebStore()
}

export async function deleteTakesByProject(projectId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.run('DELETE FROM takes WHERE project_id = ?', [projectId])
  await persistWebStore()
}

export async function toggleBestTake(takeId: string): Promise<VaultTake> {
  const db = getVaultDatabase()

  const existing = await db.query('SELECT * FROM takes WHERE id = ? LIMIT 1', [takeId])
  const row = existing.values?.[0] as SqlRow | undefined
  if (!row) {
    throw new Error(`Take not found: ${takeId}`)
  }

  const nextValue = Number(row.is_best_take) === 1 ? 0 : 1
  const statements = [
    {
      statement: 'UPDATE takes SET is_best_take = ? WHERE id = ?',
      values: [nextValue, takeId],
    },
  ]
  if (nextValue === 1) {
    statements.push({
      statement: `INSERT OR IGNORE INTO best_take_history
                  (id, project_id, take_id, marked_at)
                  VALUES (?, ?, ?, ?)`,
      values: [crypto.randomUUID(), String(row.project_id), takeId, Date.now()],
    })
  }
  await db.executeSet(statements, true)

  await persistWebStore()

  return mapTakeRow({
    ...row,
    is_best_take: nextValue,
  })
}

/** Mark one take as Best Take for a session; clears the flag on siblings. */
export async function setProjectBestTake(projectId: string, takeId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.executeSet(
    [
      {
        statement: 'UPDATE takes SET is_best_take = 0 WHERE project_id = ?',
        values: [projectId],
      },
      {
        statement: 'UPDATE takes SET is_best_take = 1 WHERE id = ? AND project_id = ?',
        values: [takeId, projectId],
      },
      {
        statement: `INSERT OR IGNORE INTO best_take_history
                    (id, project_id, take_id, marked_at)
                    VALUES (?, ?, ?, ?)`,
        values: [crypto.randomUUID(), projectId, takeId, Date.now()],
      },
      {
        statement: 'UPDATE projects SET benchmark_source = ?, benchmark_ref_id = ? WHERE id = ?',
        values: ['take', takeId, projectId],
      },
    ],
    true,
  )
  await persistWebStore()
}

export async function listBestTakeHistory(
  projectId?: string,
): Promise<BestTakeHistoryEntry[]> {
  const db = getVaultDatabase()
  const where = projectId ? 'WHERE history.project_id = ?' : ''
  const result = await db.query(
    `SELECT
       history.id,
       history.project_id,
       projects.name AS project_name,
       history.take_id,
       takes.name AS take_name,
       history.marked_at,
       takes.created_at AS take_created_at,
       takes.duration,
       takes.media_type,
       takes.is_best_take AS is_current_best
     FROM best_take_history AS history
     JOIN takes ON takes.id = history.take_id
     JOIN projects ON projects.id = history.project_id
     ${where}
     ORDER BY history.marked_at DESC`,
    projectId ? [projectId] : [],
  )
  return (result.values ?? []).map((row) => mapBestTakeHistoryRow(row as SqlRow))
}

/** Clear one persisted Best Take without overwriting a newer benchmark selection. */
export async function clearProjectBestTake(projectId: string, takeId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.executeSet(
    [
      {
        statement: 'UPDATE takes SET is_best_take = 0 WHERE project_id = ? AND id = ?',
        values: [projectId, takeId],
      },
      {
        statement: `UPDATE projects
                    SET benchmark_source = NULL, benchmark_ref_id = NULL
                    WHERE id = ? AND benchmark_source = 'take' AND benchmark_ref_id = ?`,
        values: [projectId, takeId],
      },
    ],
    true,
  )
  await persistWebStore()
}

export async function getTakesByProject(projectId: string): Promise<VaultTake[]> {
  const db = getVaultDatabase()
  const result = await db.query(
    'SELECT * FROM takes WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
  )
  return (result.values ?? []).map((row) => mapTakeRow(row as SqlRow))
}

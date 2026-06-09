import { getVaultDatabase, persistVaultWebStore } from './connection'
import type { Project, SaveTakeInput, VaultTake, VaultTakeUpdate } from './types'

type SqlRow = Record<string, unknown>

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
  }

  await db.run(
    `INSERT INTO takes (
      id, project_id, file_path, duration, is_best_take, created_at,
      name, mime_type, media_type, rating, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  if (fields.length === 0) return

  values.push(takeId)
  await db.run(`UPDATE takes SET ${fields.join(', ')} WHERE id = ?`, values)
  await persistWebStore()
}

export async function deleteVaultTake(takeId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.run('DELETE FROM takes WHERE id = ?', [takeId])
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
  await db.run('UPDATE takes SET is_best_take = ? WHERE id = ?', [nextValue, takeId])

  await persistWebStore()

  return mapTakeRow({
    ...row,
    is_best_take: nextValue,
  })
}

/** Mark one take as Best Take for a session; clears the flag on siblings. */
export async function setProjectBestTake(projectId: string, takeId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.run('UPDATE takes SET is_best_take = 0 WHERE project_id = ?', [projectId])
  await db.run('UPDATE takes SET is_best_take = 1 WHERE id = ?', [takeId])
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

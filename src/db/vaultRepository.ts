import { getVaultDatabase, persistVaultWebStore } from './connection'
import type { Project, VaultTake } from './types'

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

export async function saveTake(
  projectId: string,
  filePath: string,
  duration: number,
  takeId?: string,
): Promise<VaultTake> {
  const db = getVaultDatabase()
  const trimmedPath = filePath.trim()
  if (!trimmedPath) {
    throw new Error('Take file path cannot be empty.')
  }

  const projectCheck = await db.query('SELECT id FROM projects WHERE id = ? LIMIT 1', [
    projectId,
  ])
  if ((projectCheck.values ?? []).length === 0) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const take: VaultTake = {
    id: takeId ?? crypto.randomUUID(),
    projectId,
    filePath: trimmedPath,
    duration: Math.max(0, Math.round(duration)),
    isBestTake: false,
    createdAt: Date.now(),
  }

  await db.run(
    `INSERT INTO takes (id, project_id, file_path, duration, is_best_take, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      take.id,
      take.projectId,
      take.filePath,
      take.duration,
      take.isBestTake ? 1 : 0,
      take.createdAt,
    ],
  )

  await persistWebStore()
  return take
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

export async function getTakesByProject(projectId: string): Promise<VaultTake[]> {
  const db = getVaultDatabase()
  const result = await db.query(
    'SELECT * FROM takes WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
  )
  return (result.values ?? []).map((row) => mapTakeRow(row as SqlRow))
}

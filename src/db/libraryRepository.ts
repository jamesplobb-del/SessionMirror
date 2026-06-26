import { getVaultDatabase, persistVaultWebStore } from './connection'
import type { BenchmarkBindingRow, VaultLibraryItem } from './types'
import type { BenchmarkBinding } from '../types/library'

type SqlRow = Record<string, unknown>

function mapLibraryItemRow(row: SqlRow): VaultLibraryItem {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    kind: 'audio',
    name: String(row.name ?? ''),
    createdAt: Number(row.created_at),
    filePath: String(row.file_path),
    mimeType: String(row.mime_type ?? 'audio/mpeg'),
    duration: Number(row.duration ?? 0),
  }
}

async function persistWebStore(): Promise<void> {
  await persistVaultWebStore()
}

export async function getLibraryItemsByProject(projectId: string): Promise<VaultLibraryItem[]> {
  const db = getVaultDatabase()
  const result = await db.query(
    'SELECT * FROM library_items WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
  )
  return (result.values ?? []).map((row) => mapLibraryItemRow(row as SqlRow))
}

export interface SaveLibraryAudioInput {
  projectId: string
  filePath: string
  mimeType: string
  duration?: number
  name?: string
  itemId?: string
}

export async function saveLibraryAudioItem(
  input: SaveLibraryAudioInput,
): Promise<VaultLibraryItem> {
  const db = getVaultDatabase()
  const trimmedPath = input.filePath.trim()
  if (!trimmedPath) {
    throw new Error('Library file path cannot be empty.')
  }

  const item: VaultLibraryItem = {
    id: input.itemId ?? crypto.randomUUID(),
    projectId: input.projectId,
    kind: 'audio',
    name: input.name?.trim() ?? '',
    createdAt: Date.now(),
    filePath: trimmedPath,
    mimeType: input.mimeType,
    duration: Math.max(0, Math.round(input.duration ?? 0)),
  }

  await db.run(
    `INSERT INTO library_items (
      id, project_id, kind, name, created_at, file_path, mime_type, duration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.projectId,
      item.kind,
      item.name,
      item.createdAt,
      item.filePath,
      item.mimeType,
      item.duration,
    ],
  )

  await persistWebStore()
  return item
}

export async function updateLibraryItemName(itemId: string, name: string): Promise<void> {
  const db = getVaultDatabase()
  await db.run('UPDATE library_items SET name = ? WHERE id = ?', [name.trim(), itemId])
  await persistWebStore()
}

export async function deleteLibraryItem(itemId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.run('DELETE FROM library_items WHERE id = ?', [itemId])
  await persistWebStore()
}

export async function deleteLibraryItemsByProject(projectId: string): Promise<void> {
  const db = getVaultDatabase()
  await db.run('DELETE FROM library_items WHERE project_id = ?', [projectId])
  await persistWebStore()
}

export async function getProjectBenchmarkBinding(
  projectId: string,
): Promise<BenchmarkBinding | null> {
  const db = getVaultDatabase()
  const result = await db.query(
    'SELECT benchmark_source, benchmark_ref_id FROM projects WHERE id = ? LIMIT 1',
    [projectId],
  )
  const row = result.values?.[0] as SqlRow | undefined
  if (!row) return null

  const source = row.benchmark_source
  const refId = row.benchmark_ref_id
  if (source !== 'take' && source !== 'library') return null
  if (!refId) return null

  return {
    source,
    refId: String(refId),
  }
}

export async function setProjectBenchmarkBinding(
  projectId: string,
  binding: BenchmarkBinding | null,
): Promise<void> {
  const db = getVaultDatabase()
  if (!binding) {
    await db.run(
      'UPDATE projects SET benchmark_source = NULL, benchmark_ref_id = NULL WHERE id = ?',
      [projectId],
    )
  } else {
    await db.run(
      'UPDATE projects SET benchmark_source = ?, benchmark_ref_id = ? WHERE id = ?',
      [binding.source, binding.refId, projectId],
    )
  }
  await persistWebStore()
}

export async function setProjectLibraryBenchmark(
  projectId: string,
  libraryItemId: string,
): Promise<void> {
  await setProjectBenchmarkBinding(projectId, {
    source: 'library',
    refId: libraryItemId,
  })
}

export function mapBenchmarkBindingRow(row: BenchmarkBindingRow): BenchmarkBinding | null {
  if (row.source !== 'take' && row.source !== 'library') return null
  if (!row.refId) return null
  return { source: row.source, refId: row.refId }
}

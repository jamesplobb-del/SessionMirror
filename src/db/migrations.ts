import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

const TAKE_COLUMN_MIGRATIONS = [
  "ALTER TABLE takes ADD COLUMN name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE takes ADD COLUMN mime_type TEXT NOT NULL DEFAULT 'video/mp4'",
  "ALTER TABLE takes ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video'",
  'ALTER TABLE takes ADD COLUMN rating INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE takes ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE takes ADD COLUMN recording_orientation TEXT NOT NULL DEFAULT 'portrait'",
  'ALTER TABLE takes ADD COLUMN enhancer_baked INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE takes ADD COLUMN timeline_offset_ms INTEGER NOT NULL DEFAULT 0',
] as const

/** Idempotent column adds for existing installs. */
export async function migrateVaultSchema(db: SQLiteDBConnection): Promise<void> {
  const columns = await db.query('PRAGMA table_info(takes)')
  const existing = new Set(
    (columns.values ?? []).map((row) => String((row as Record<string, unknown>).name)),
  )

  for (const statement of TAKE_COLUMN_MIGRATIONS) {
    const match = statement.match(/ADD COLUMN (\w+)/i)
    const columnName = match?.[1]
    if (columnName && existing.has(columnName)) continue
    await db.execute(statement)
    if (columnName) existing.add(columnName)
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'audio',
      name TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
      duration INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `)
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_library_items_project_id ON library_items(project_id)',
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_library_items_created_at ON library_items(created_at DESC)',
  )

  const projectColumns = await db.query('PRAGMA table_info(projects)')
  const projectExisting = new Set(
    (projectColumns.values ?? []).map((row) =>
      String((row as Record<string, unknown>).name),
    ),
  )

  if (!projectExisting.has('benchmark_source')) {
    await db.execute('ALTER TABLE projects ADD COLUMN benchmark_source TEXT')
  }
  if (!projectExisting.has('benchmark_ref_id')) {
    await db.execute('ALTER TABLE projects ADD COLUMN benchmark_ref_id TEXT')
  }
}

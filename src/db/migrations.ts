import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

const TAKE_COLUMN_MIGRATIONS = [
  "ALTER TABLE takes ADD COLUMN name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE takes ADD COLUMN mime_type TEXT NOT NULL DEFAULT 'video/mp4'",
  "ALTER TABLE takes ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video'",
  'ALTER TABLE takes ADD COLUMN rating INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE takes ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
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
}

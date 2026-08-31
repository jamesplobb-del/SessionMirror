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
  'ALTER TABLE takes ADD COLUMN practice_session_id TEXT',
  "ALTER TABLE takes ADD COLUMN intention TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE takes ADD COLUMN focus_area TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE takes ADD COLUMN pitch_series_json TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE takes ADD COLUMN performance_start_seconds REAL',
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS best_take_history (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      take_id TEXT NOT NULL,
      marked_at INTEGER NOT NULL,
      UNIQUE(project_id, take_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (take_id) REFERENCES takes(id) ON DELETE CASCADE
    )
  `)
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_best_take_history_project ON best_take_history(project_id, marked_at DESC)',
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_best_take_history_marked_at ON best_take_history(marked_at DESC)',
  )
  await db.execute(`
    INSERT OR IGNORE INTO best_take_history (id, project_id, take_id, marked_at)
    SELECT 'legacy-best-' || id, project_id, id, created_at
    FROM takes
    WHERE is_best_take = 1
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pitch_observations (
      id TEXT PRIMARY KEY NOT NULL,
      midi_note INTEGER NOT NULL,
      note_name TEXT NOT NULL,
      octave INTEGER NOT NULL,
      cents_offset REAL NOT NULL,
      observed_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      sample_count INTEGER NOT NULL,
      variability_cents REAL NOT NULL DEFAULT 0,
      tuner_instrument TEXT NOT NULL DEFAULT 'voice',
      transposition_id TEXT NOT NULL DEFAULT 'concert',
      session_id TEXT
    )
  `)
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_pitch_observations_note ON pitch_observations(midi_note, observed_at DESC)',
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_pitch_observations_observed_at ON pitch_observations(observed_at DESC)',
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      focus_area TEXT NOT NULL DEFAULT '',
      comparison_mode TEXT NOT NULL DEFAULT 'current-best',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `)
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_practice_sessions_project ON practice_sessions(project_id, started_at DESC)',
  )
  await db.execute(`
    CREATE TABLE IF NOT EXISTS practice_item_states (
      project_id TEXT PRIMARY KEY NOT NULL,
      focus_area TEXT NOT NULL DEFAULT '',
      comparison_mode TEXT NOT NULL DEFAULT 'current-best',
      loop_start_seconds REAL,
      loop_end_seconds REAL,
      pending_intention TEXT NOT NULL DEFAULT '',
      last_session_id TEXT,
      last_opened_at INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (last_session_id) REFERENCES practice_sessions(id) ON DELETE SET NULL
    )
  `)
}

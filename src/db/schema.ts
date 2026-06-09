export const DB_NAME = 'besttake_vault'
export const DB_VERSION = 1

export const DEFAULT_PROJECT_NAME = 'My Session'

/** Gemini schema + UUID text keys and FK cascade (better fit for BestTake). */
export const CREATE_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS takes (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  is_best_take INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_takes_project_id ON takes(project_id);
CREATE INDEX IF NOT EXISTS idx_takes_created_at ON takes(created_at DESC);
`

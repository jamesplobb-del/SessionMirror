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

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  focus_area TEXT NOT NULL DEFAULT '',
  comparison_mode TEXT NOT NULL DEFAULT 'current-best',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_project
  ON practice_sessions(project_id, started_at DESC);

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
);

CREATE TABLE IF NOT EXISTS takes (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  is_best_take INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  practice_session_id TEXT,
  intention TEXT NOT NULL DEFAULT '',
  focus_area TEXT NOT NULL DEFAULT '',
  pitch_series_json TEXT NOT NULL DEFAULT '',
  performance_start_seconds REAL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_takes_project_id ON takes(project_id);
CREATE INDEX IF NOT EXISTS idx_takes_created_at ON takes(created_at DESC);

CREATE TABLE IF NOT EXISTS best_take_history (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  take_id TEXT NOT NULL,
  marked_at INTEGER NOT NULL,
  UNIQUE(project_id, take_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (take_id) REFERENCES takes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_best_take_history_project
  ON best_take_history(project_id, marked_at DESC);
CREATE INDEX IF NOT EXISTS idx_best_take_history_marked_at
  ON best_take_history(marked_at DESC);

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
);

CREATE INDEX IF NOT EXISTS idx_library_items_project_id ON library_items(project_id);
CREATE INDEX IF NOT EXISTS idx_library_items_created_at ON library_items(created_at DESC);

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
);

CREATE INDEX IF NOT EXISTS idx_pitch_observations_note
  ON pitch_observations(midi_note, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pitch_observations_observed_at
  ON pitch_observations(observed_at DESC);
`

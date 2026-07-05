export const SOUND_BOARD_TEMPLATES_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS sound_usage_templates (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  engine_type TEXT NOT NULL DEFAULT 'generic'
    CHECK (engine_type IN ('generic', 'unity', 'unreal', 'monogame')),
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sound_usage_templates_library_name
  ON sound_usage_templates (library_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_sound_usage_templates_library
  ON sound_usage_templates (library_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS sound_usage_status_history (
  id TEXT PRIMARY KEY,
  usage_item_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (usage_item_id) REFERENCES sound_usage_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sound_usage_status_history_item
  ON sound_usage_status_history (usage_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sound_usage_items_project_updated
  ON sound_usage_items (project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sound_usage_items_project_category
  ON sound_usage_items (project_id, category, priority);

CREATE INDEX IF NOT EXISTS idx_sound_usage_candidates_review
  ON sound_usage_candidates (usage_item_id, selected, approved, rejected);
`;

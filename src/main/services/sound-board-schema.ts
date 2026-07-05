export const GAME_SOUND_BOARD_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS game_projects (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  engine_type TEXT NOT NULL DEFAULT 'generic'
    CHECK (engine_type IN ('generic', 'unity', 'unreal', 'monogame')),
  root_namespace TEXT NOT NULL DEFAULT '',
  default_export_format TEXT NOT NULL DEFAULT 'generic_manifest'
    CHECK (
      default_export_format IN (
        'generic_manifest',
        'unity_manifest',
        'unreal_manifest',
        'monogame_manifest',
        'codex_instruction',
        'sound_pack'
      )
    ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_game_projects_library
  ON game_projects (library_id, archived_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS sound_usage_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  library_id TEXT NOT NULL,
  key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'sfx'
    CHECK (category IN ('ui', 'sfx', 'bgm', 'ambience', 'voice', 'music', 'other')),
  description TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'missing'
    CHECK (status IN ('missing', 'needs_candidates', 'reviewing', 'selected', 'approved', 'rejected', 'deferred')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  loop_required INTEGER NOT NULL DEFAULT 0,
  variants_allowed INTEGER NOT NULL DEFAULT 0,
  target_duration_ms INTEGER,
  target_loudness_note TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (project_id) REFERENCES game_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sound_usage_items_project_key
  ON sound_usage_items (project_id, key);

CREATE INDEX IF NOT EXISTS idx_sound_usage_items_project_status
  ON sound_usage_items (project_id, archived_at, status, priority);

CREATE INDEX IF NOT EXISTS idx_sound_usage_items_library
  ON sound_usage_items (library_id);

CREATE TABLE IF NOT EXISTS sound_usage_candidates (
  id TEXT PRIMARY KEY,
  usage_item_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  candidate_rank INTEGER NOT NULL DEFAULT 0,
  fit_score REAL,
  fit_reason_json TEXT NOT NULL DEFAULT '[]',
  user_note TEXT NOT NULL DEFAULT '',
  selected INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (usage_item_id) REFERENCES sound_usage_items(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sound_usage_candidates_unique
  ON sound_usage_candidates (usage_item_id, asset_id);

CREATE INDEX IF NOT EXISTS idx_sound_usage_candidates_usage
  ON sound_usage_candidates (usage_item_id, selected, rejected, candidate_rank);

CREATE INDEX IF NOT EXISTS idx_sound_usage_candidates_asset
  ON sound_usage_candidates (asset_id);
`;

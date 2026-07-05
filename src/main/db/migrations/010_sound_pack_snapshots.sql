ALTER TABLE game_projects ADD COLUMN baseline_snapshot_id TEXT;

ALTER TABLE export_history ADD COLUMN snapshot_id TEXT;
ALTER TABLE export_history ADD COLUMN baseline_snapshot_id TEXT;
ALTER TABLE export_history ADD COLUMN diff_summary_json TEXT;

CREATE TABLE IF NOT EXISTS sound_pack_snapshots (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'exported', 'archived')),
  frozen INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  selected_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'local',
  export_history_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES game_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sound_pack_snapshot_items (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  usage_item_id TEXT NOT NULL,
  usage_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  loop_required INTEGER NOT NULL DEFAULT 0,
  variants_allowed INTEGER NOT NULL DEFAULT 0,
  selected_asset_ids_json TEXT NOT NULL DEFAULT '[]',
  approved_asset_ids_json TEXT NOT NULL DEFAULT '[]',
  candidate_asset_ids_json TEXT NOT NULL DEFAULT '[]',
  item_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES sound_pack_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sound_pack_snapshots_project
  ON sound_pack_snapshots (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sound_pack_snapshots_library
  ON sound_pack_snapshots (library_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sound_pack_snapshots_status
  ON sound_pack_snapshots (project_id, status, frozen, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sound_pack_snapshot_items_snapshot
  ON sound_pack_snapshot_items (snapshot_id, usage_key COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_sound_pack_snapshot_items_usage
  ON sound_pack_snapshot_items (usage_item_id);

CREATE INDEX IF NOT EXISTS idx_export_history_snapshot
  ON export_history (library_id, snapshot_id, created_at DESC);

DROP TABLE IF EXISTS export_presets_phase13;

CREATE TABLE export_presets_phase13 (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'codex_instruction',
      'generic_manifest',
      'unity_manifest',
      'unreal_manifest',
      'monogame_manifest',
      'sound_pack',
      'csv_report',
      'project_sound_pack',
      'project_manifest',
      'project_missing_report',
      'project_codex_instruction',
      'sound_request_markdown',
      'sound_request_csv',
      'sound_request_json',
      'project_style_guide_markdown',
      'project_checklist_markdown',
      'sound_pack_snapshot_json',
      'sound_pack_changelog_markdown',
      'sound_pack_changelog_json',
      'sound_pack_changelog_csv'
    )
  ),
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

INSERT INTO export_presets_phase13 (id, library_id, name, type, config_json, created_at, updated_at)
SELECT id, library_id, name, type, config_json, created_at, updated_at
FROM export_presets;

DROP TABLE export_presets;
ALTER TABLE export_presets_phase13 RENAME TO export_presets;

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_presets_library_name
  ON export_presets (library_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_export_presets_type
  ON export_presets (library_id, type);

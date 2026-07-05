ALTER TABLE export_history ADD COLUMN review_id TEXT;

CREATE TABLE IF NOT EXISTS sound_change_reviews (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  from_snapshot_id TEXT,
  to_snapshot_id TEXT,
  compare_to_current INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewing', 'approved', 'rejected', 'archived')),
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES game_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (from_snapshot_id) REFERENCES sound_pack_snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY (to_snapshot_id) REFERENCES sound_pack_snapshots(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sound_change_review_items (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  usage_item_id TEXT,
  usage_key TEXT NOT NULL,
  change_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'breaking')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'deferred')),
  before_json TEXT NOT NULL DEFAULT 'null',
  after_json TEXT NOT NULL DEFAULT 'null',
  message_key TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL DEFAULT '',
  asset_id TEXT,
  reviewer_note TEXT NOT NULL DEFAULT '',
  decision_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (review_id) REFERENCES sound_change_reviews(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sound_change_reviews_project
  ON sound_change_reviews (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sound_change_reviews_status
  ON sound_change_reviews (project_id, status, archived_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sound_change_review_items_review
  ON sound_change_review_items (review_id, status, severity, change_type, usage_key COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_sound_change_review_items_status
  ON sound_change_review_items (status, severity, change_type);

CREATE INDEX IF NOT EXISTS idx_sound_change_review_items_usage
  ON sound_change_review_items (usage_key COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_export_history_review
  ON export_history (library_id, review_id, created_at DESC);

DROP TABLE IF EXISTS export_presets_phase14;

CREATE TABLE export_presets_phase14 (
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
      'sound_pack_changelog_csv',
      'sound_change_review_markdown',
      'sound_change_review_json',
      'sound_change_review_csv'
    )
  ),
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

INSERT INTO export_presets_phase14 (id, library_id, name, type, config_json, created_at, updated_at)
SELECT id, library_id, name, type, config_json, created_at, updated_at
FROM export_presets;

DROP TABLE export_presets;
ALTER TABLE export_presets_phase14 RENAME TO export_presets;

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_presets_library_name
  ON export_presets (library_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_export_presets_type
  ON export_presets (library_id, type);

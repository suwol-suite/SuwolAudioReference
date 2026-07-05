CREATE TABLE IF NOT EXISTS asset_rights_metadata (
  asset_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  license_name TEXT NOT NULL DEFAULT '',
  license_url TEXT NOT NULL DEFAULT '',
  attribution_text TEXT NOT NULL DEFAULT '',
  usage_notes TEXT NOT NULL DEFAULT '',
  commercial_use_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (commercial_use_status IN ('unknown', 'allowed', 'not_allowed', 'check_required')),
  credit_required TEXT NOT NULL DEFAULT 'unknown'
    CHECK (credit_required IN ('unknown', 'yes', 'no')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS export_presets (
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
      'project_sound_pack',
      'project_manifest',
      'project_missing_report',
      'project_codex_instruction',
      'csv_report'
    )
  ),
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_presets_library_name
  ON export_presets (library_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_export_presets_type
  ON export_presets (library_id, type);

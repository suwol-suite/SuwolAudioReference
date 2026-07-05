DROP TABLE IF EXISTS export_presets_next;

CREATE TABLE export_presets_next (
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
      'project_codex_instruction'
    )
  ),
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

INSERT INTO export_presets_next (id, library_id, name, type, config_json, created_at, updated_at)
SELECT id, library_id, name, type, config_json, created_at, updated_at
FROM export_presets;

DROP TABLE export_presets;
ALTER TABLE export_presets_next RENAME TO export_presets;

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_presets_library_name
  ON export_presets (library_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_export_presets_type
  ON export_presets (library_id, type);

CREATE TABLE IF NOT EXISTS export_history (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  target TEXT NOT NULL,
  source_label TEXT NOT NULL,
  output_path TEXT,
  files_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  options_json TEXT NOT NULL,
  project_id TEXT,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_export_history_library_created
  ON export_history (library_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_history_project
  ON export_history (library_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_history_target
  ON export_history (library_id, target, created_at DESC);

ALTER TABLE sound_usage_items ADD COLUMN work_note TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_items ADD COLUMN assignee TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_items ADD COLUMN due_label TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_items ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_items ADD COLUMN decision_note TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_items ADD COLUMN updated_workflow_at TEXT;

ALTER TABLE sound_usage_candidates ADD COLUMN pros TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_candidates ADD COLUMN cons TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_candidates ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_candidates ADD COLUMN decision_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_candidates ADD COLUMN rating_for_usage INTEGER;
ALTER TABLE sound_usage_candidates ADD COLUMN loudness_fit TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_candidates ADD COLUMN loop_fit TEXT NOT NULL DEFAULT '';
ALTER TABLE sound_usage_candidates ADD COLUMN mood_fit TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS sound_project_style_guides (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  overview TEXT NOT NULL DEFAULT '',
  ui_sound_guide TEXT NOT NULL DEFAULT '',
  sfx_guide TEXT NOT NULL DEFAULT '',
  bgm_guide TEXT NOT NULL DEFAULT '',
  ambience_guide TEXT NOT NULL DEFAULT '',
  voice_guide TEXT NOT NULL DEFAULT '',
  loudness_guide TEXT NOT NULL DEFAULT '',
  loop_guide TEXT NOT NULL DEFAULT '',
  naming_guide TEXT NOT NULL DEFAULT '',
  license_guide TEXT NOT NULL DEFAULT '',
  export_guide TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES game_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sound_project_checklist_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  label TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  built_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES game_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sound_usage_items_workflow
  ON sound_usage_items (project_id, assignee COLLATE NOCASE, due_label COLLATE NOCASE, updated_workflow_at DESC);

CREATE INDEX IF NOT EXISTS idx_sound_project_checklist_project
  ON sound_project_checklist_items (project_id, sort_order, created_at);

DROP TABLE IF EXISTS export_presets_phase12;

CREATE TABLE export_presets_phase12 (
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
      'project_checklist_markdown'
    )
  ),
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

INSERT INTO export_presets_phase12 (id, library_id, name, type, config_json, created_at, updated_at)
SELECT id, library_id, name, type, config_json, created_at, updated_at
FROM export_presets;

DROP TABLE export_presets;
ALTER TABLE export_presets_phase12 RENAME TO export_presets;

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_presets_library_name
  ON export_presets (library_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_export_presets_type
  ON export_presets (library_id, type);

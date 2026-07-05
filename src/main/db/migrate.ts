import { ASSET_AUDIO_ANALYSIS_MIGRATION_SQL } from "../services/audio-analysis-repository";
import { ASSET_AUDIO_FEATURES_MIGRATION_SQL } from "../services/audio-feature-repository";
import { GAME_SOUND_BOARD_MIGRATION_SQL } from "../services/sound-board-schema";
import { SOUND_BOARD_TEMPLATES_MIGRATION_SQL } from "../services/sound-board-template-schema";
import { CORE_SCHEMA_MIGRATION_SQL } from "./core-schema";
import type { LibraryDatabase } from "./library-database";

export interface MigrationDefinition {
  id: string;
  sql: string;
}

const EXPORT_CENTER_PHASE_11B_MIGRATION_SQL = `
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
`;

const SOUND_WORKFLOW_PRODUCTIVITY_MIGRATION_SQL = `
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
`;

const SOUND_PACK_SNAPSHOTS_MIGRATION_SQL = `
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
`;

export const MIGRATIONS: MigrationDefinition[] = [
  { id: "000_core_schema", sql: CORE_SCHEMA_MIGRATION_SQL },
  { id: "001_asset_audio_analysis", sql: ASSET_AUDIO_ANALYSIS_MIGRATION_SQL },
  {
    id: "002_asset_playback_state",
    sql: `
ALTER TABLE assets ADD COLUMN last_played_at TEXT;
ALTER TABLE assets ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN playback_supported INTEGER;
ALTER TABLE assets ADD COLUMN playback_error_code TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_last_played
  ON assets (library_id, last_played_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_play_count
  ON assets (library_id, play_count DESC);
`,
  },
  {
    id: "003_library_management",
    sql: `
DROP INDEX IF EXISTS idx_assets_library_hash;

ALTER TABLE assets ADD COLUMN file_missing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN file_missing_checked_at TEXT;
ALTER TABLE assets ADD COLUMN relinked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_library_hash
  ON assets (library_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_assets_file_ext
  ON assets (library_id, file_ext);

CREATE INDEX IF NOT EXISTS idx_assets_media_type
  ON assets (library_id, media_type);

CREATE INDEX IF NOT EXISTS idx_assets_favorite_rating
  ON assets (library_id, favorite, rating);

CREATE INDEX IF NOT EXISTS idx_asset_tags_tag_id
  ON asset_tags (tag_id);

CREATE INDEX IF NOT EXISTS idx_collection_assets_asset_id
  ON collection_assets (asset_id);

CREATE TABLE IF NOT EXISTS ignored_duplicate_groups (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  ignored_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_duplicate_groups_unique
  ON ignored_duplicate_groups (library_id, content_hash);

CREATE TABLE IF NOT EXISTS import_sources (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  path TEXT NOT NULL,
  import_mode TEXT NOT NULL CHECK (import_mode IN ('copy', 'link')),
  last_scanned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_sources_path
  ON import_sources (library_id, path);
`,
  },
  {
    id: "004_export_center",
    sql: `
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
`,
  },
  { id: "005_audio_similarity", sql: ASSET_AUDIO_FEATURES_MIGRATION_SQL },
  { id: "006_game_sound_board", sql: GAME_SOUND_BOARD_MIGRATION_SQL },
  { id: "007_sound_board_templates", sql: SOUND_BOARD_TEMPLATES_MIGRATION_SQL },
  { id: "008_export_center_phase_11b", sql: EXPORT_CENTER_PHASE_11B_MIGRATION_SQL },
  { id: "009_sound_workflow_productivity", sql: SOUND_WORKFLOW_PRODUCTIVITY_MIGRATION_SQL },
  { id: "010_sound_pack_snapshots", sql: SOUND_PACK_SNAPSHOTS_MIGRATION_SQL },
];

export function runMigrations(db: LibraryDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  for (const migration of MIGRATIONS) {
    const exists = db.get<{ id: string }>("SELECT id FROM schema_migrations WHERE id = ?", [migration.id]);
    if (exists) {
      continue;
    }

    db.transaction(() => {
      db.exec(migration.sql);
      db.run("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [
        migration.id,
        new Date().toISOString(),
      ]);
    });
  }
}

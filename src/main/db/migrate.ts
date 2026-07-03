import { ASSET_AUDIO_ANALYSIS_MIGRATION_SQL } from "../services/audio-analysis-repository";
import { ASSET_AUDIO_FEATURES_MIGRATION_SQL } from "../services/audio-feature-repository";
import { CORE_SCHEMA_MIGRATION_SQL } from "./core-schema";
import type { LibraryDatabase } from "./library-database";

export interface MigrationDefinition {
  id: string;
  sql: string;
}

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

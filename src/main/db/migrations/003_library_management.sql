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

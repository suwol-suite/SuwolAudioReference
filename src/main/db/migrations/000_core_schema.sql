CREATE TABLE IF NOT EXISTS libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  original_path TEXT NOT NULL,
  stored_path TEXT,
  file_name TEXT NOT NULL,
  file_ext TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  import_mode TEXT NOT NULL CHECK (import_mode IN ('copy', 'link')),
  media_type TEXT NOT NULL CHECK (media_type IN ('audio', 'midi', 'data', 'archive')),
  title TEXT,
  memo TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  favorite INTEGER NOT NULL DEFAULT 0,
  trashed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_library_hash
  ON assets (library_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_assets_library_created
  ON assets (library_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_trashed
  ON assets (library_id, trashed_at);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#55c7a5',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_library_name_unique
  ON tags (library_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_id, tag_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_library_name_unique
  ON collections (library_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS collection_assets (
  collection_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, asset_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recent_libraries (
  id TEXT PRIMARY KEY,
  library_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_warnings (
  id TEXT PRIMARY KEY,
  asset_id TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

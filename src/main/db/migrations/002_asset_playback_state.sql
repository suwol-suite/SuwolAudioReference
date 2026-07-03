ALTER TABLE assets ADD COLUMN last_played_at TEXT;
ALTER TABLE assets ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN playback_supported INTEGER;
ALTER TABLE assets ADD COLUMN playback_error_code TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_last_played
  ON assets (library_id, last_played_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_play_count
  ON assets (library_id, play_count DESC);

CREATE TABLE IF NOT EXISTS asset_audio_analysis (
  asset_id TEXT PRIMARY KEY,
  duration_ms INTEGER,
  sample_rate INTEGER,
  channels INTEGER,
  bitrate INTEGER,
  codec TEXT,
  format TEXT,
  peak_db REAL,
  rms_db REAL,
  loudness_db REAL,
  silence_start_ms INTEGER,
  silence_end_ms INTEGER,
  transient_count INTEGER,
  zero_crossing_rate REAL,
  spectral_centroid REAL,
  spectral_flatness REAL,
  loop_score REAL,
  classification_json TEXT NOT NULL DEFAULT '[]',
  suggested_tags_json TEXT NOT NULL DEFAULT '[]',
  waveform_summary_json TEXT,
  analyzer_version TEXT NOT NULL,
  ignored_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_audio_analysis_analyzer_version
  ON asset_audio_analysis (analyzer_version);

CREATE INDEX IF NOT EXISTS idx_asset_audio_analysis_loop_score
  ON asset_audio_analysis (loop_score);

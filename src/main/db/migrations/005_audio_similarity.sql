CREATE TABLE IF NOT EXISTS asset_audio_features (
  asset_id TEXT PRIMARY KEY,
  analyzer_version TEXT NOT NULL,
  duration_ms INTEGER,
  dynamic_range_db REAL,
  attack_time_ms INTEGER,
  decay_time_ms INTEGER,
  spectral_centroid_mean REAL,
  spectral_centroid_std REAL,
  spectral_flatness REAL,
  spectral_rolloff_hz REAL,
  spectral_bandwidth_hz REAL,
  low_band_ratio REAL,
  mid_band_ratio REAL,
  high_band_ratio REAL,
  transient_density REAL,
  rhythmic_repetition_score REAL,
  loop_boundary_similarity REAL,
  loop_click_risk REAL,
  loop_fade_out_risk REAL,
  waveform_shape_hash TEXT,
  feature_vector_json TEXT NOT NULL DEFAULT '[]',
  loop_reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_audio_features_analyzer_version
  ON asset_audio_features (analyzer_version);

CREATE INDEX IF NOT EXISTS idx_asset_audio_features_duration
  ON asset_audio_features (duration_ms);

CREATE INDEX IF NOT EXISTS idx_asset_audio_features_centroid
  ON asset_audio_features (spectral_centroid_mean);

CREATE INDEX IF NOT EXISTS idx_asset_audio_features_transient_density
  ON asset_audio_features (transient_density);

CREATE INDEX IF NOT EXISTS idx_asset_audio_features_loop_boundary
  ON asset_audio_features (loop_boundary_similarity);

CREATE TABLE IF NOT EXISTS asset_similarity_cache (
  asset_id TEXT NOT NULL,
  candidate_asset_id TEXT NOT NULL,
  analyzer_version TEXT NOT NULL,
  score REAL NOT NULL,
  label TEXT NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_id, candidate_asset_id, analyzer_version),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (candidate_asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_similarity_cache_score
  ON asset_similarity_cache (asset_id, score DESC);

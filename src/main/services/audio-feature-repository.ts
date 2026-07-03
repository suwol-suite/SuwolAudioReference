import type { AssetAudioFeatureRecord, LoopAnalysisReasonCode } from "../../shared/audio-feature-types";

export interface SqlExecutor {
  run(sql: string, params?: unknown[] | Record<string, unknown>): Promise<unknown> | unknown;
}

export interface SqlReader {
  get<T>(sql: string, params?: unknown[] | Record<string, unknown>): T | undefined;
  all<T>(sql: string, params?: unknown[] | Record<string, unknown>): T[];
}

export interface AssetAudioFeatureRow {
  asset_id: string;
  analyzer_version: string;
  duration_ms: number | null;
  dynamic_range_db: number | null;
  attack_time_ms: number | null;
  decay_time_ms: number | null;
  spectral_centroid_mean: number | null;
  spectral_centroid_std: number | null;
  spectral_flatness: number | null;
  spectral_rolloff_hz: number | null;
  spectral_bandwidth_hz: number | null;
  low_band_ratio: number | null;
  mid_band_ratio: number | null;
  high_band_ratio: number | null;
  transient_density: number | null;
  rhythmic_repetition_score: number | null;
  loop_boundary_similarity: number | null;
  loop_click_risk: number | null;
  loop_fade_out_risk: number | null;
  waveform_shape_hash: string | null;
  feature_vector_json: string;
  loop_reasons_json: string;
  created_at: string;
  updated_at: string;
}

export const ASSET_AUDIO_FEATURES_MIGRATION_SQL = `
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
`;

export async function upsertAssetAudioFeature(
  db: SqlExecutor,
  feature: AssetAudioFeatureRecord,
  now = new Date(),
): Promise<AssetAudioFeatureRecord> {
  const timestamp = now.toISOString();
  const record: AssetAudioFeatureRecord = {
    ...feature,
    createdAt: feature.createdAt || timestamp,
    updatedAt: timestamp,
  };

  await db.run(
    `
    INSERT INTO asset_audio_features (
      asset_id,
      analyzer_version,
      duration_ms,
      dynamic_range_db,
      attack_time_ms,
      decay_time_ms,
      spectral_centroid_mean,
      spectral_centroid_std,
      spectral_flatness,
      spectral_rolloff_hz,
      spectral_bandwidth_hz,
      low_band_ratio,
      mid_band_ratio,
      high_band_ratio,
      transient_density,
      rhythmic_repetition_score,
      loop_boundary_similarity,
      loop_click_risk,
      loop_fade_out_risk,
      waveform_shape_hash,
      feature_vector_json,
      loop_reasons_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
      analyzer_version = excluded.analyzer_version,
      duration_ms = excluded.duration_ms,
      dynamic_range_db = excluded.dynamic_range_db,
      attack_time_ms = excluded.attack_time_ms,
      decay_time_ms = excluded.decay_time_ms,
      spectral_centroid_mean = excluded.spectral_centroid_mean,
      spectral_centroid_std = excluded.spectral_centroid_std,
      spectral_flatness = excluded.spectral_flatness,
      spectral_rolloff_hz = excluded.spectral_rolloff_hz,
      spectral_bandwidth_hz = excluded.spectral_bandwidth_hz,
      low_band_ratio = excluded.low_band_ratio,
      mid_band_ratio = excluded.mid_band_ratio,
      high_band_ratio = excluded.high_band_ratio,
      transient_density = excluded.transient_density,
      rhythmic_repetition_score = excluded.rhythmic_repetition_score,
      loop_boundary_similarity = excluded.loop_boundary_similarity,
      loop_click_risk = excluded.loop_click_risk,
      loop_fade_out_risk = excluded.loop_fade_out_risk,
      waveform_shape_hash = excluded.waveform_shape_hash,
      feature_vector_json = excluded.feature_vector_json,
      loop_reasons_json = excluded.loop_reasons_json,
      updated_at = excluded.updated_at
    `,
    [
      record.assetId,
      record.analyzerVersion,
      numberOrNull(record.durationMs),
      numberOrNull(record.dynamicRangeDb),
      numberOrNull(record.attackTimeMs),
      numberOrNull(record.decayTimeMs),
      numberOrNull(record.spectralCentroidMean),
      numberOrNull(record.spectralCentroidStd),
      numberOrNull(record.spectralFlatness),
      numberOrNull(record.spectralRolloffHz),
      numberOrNull(record.spectralBandwidthHz),
      numberOrNull(record.lowBandRatio),
      numberOrNull(record.midBandRatio),
      numberOrNull(record.highBandRatio),
      numberOrNull(record.transientDensity),
      numberOrNull(record.rhythmicRepetitionScore),
      numberOrNull(record.loopBoundarySimilarity),
      numberOrNull(record.loopClickRisk),
      numberOrNull(record.loopFadeOutRisk),
      record.waveformShapeHash,
      JSON.stringify(record.featureVector.filter(Number.isFinite)),
      JSON.stringify(record.loopReasons),
      record.createdAt,
      record.updatedAt,
    ],
  );

  return record;
}

export function getAssetAudioFeature(db: SqlReader, assetId: string): AssetAudioFeatureRecord | null {
  const row = db.get<AssetAudioFeatureRow>("SELECT * FROM asset_audio_features WHERE asset_id = ?", [assetId]);
  return row ? mapAssetAudioFeatureRow(row) : null;
}

export function mapAssetAudioFeatureRow(row: AssetAudioFeatureRow): AssetAudioFeatureRecord {
  return {
    assetId: row.asset_id,
    analyzerVersion: row.analyzer_version,
    durationMs: numberOrNull(row.duration_ms),
    dynamicRangeDb: numberOrNull(row.dynamic_range_db),
    attackTimeMs: numberOrNull(row.attack_time_ms),
    decayTimeMs: numberOrNull(row.decay_time_ms),
    spectralCentroidMean: numberOrNull(row.spectral_centroid_mean),
    spectralCentroidStd: numberOrNull(row.spectral_centroid_std),
    spectralFlatness: numberOrNull(row.spectral_flatness),
    spectralRolloffHz: numberOrNull(row.spectral_rolloff_hz),
    spectralBandwidthHz: numberOrNull(row.spectral_bandwidth_hz),
    lowBandRatio: numberOrNull(row.low_band_ratio),
    midBandRatio: numberOrNull(row.mid_band_ratio),
    highBandRatio: numberOrNull(row.high_band_ratio),
    transientDensity: numberOrNull(row.transient_density),
    rhythmicRepetitionScore: numberOrNull(row.rhythmic_repetition_score),
    loopBoundarySimilarity: numberOrNull(row.loop_boundary_similarity),
    loopClickRisk: numberOrNull(row.loop_click_risk),
    loopFadeOutRisk: numberOrNull(row.loop_fade_out_risk),
    waveformShapeHash: row.waveform_shape_hash,
    featureVector: parseNumberArray(row.feature_vector_json),
    loopReasons: parseJson<LoopAnalysisReasonCode[]>(row.loop_reasons_json) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseNumberArray(value: string | null): number[] {
  const parsed = parseJson<unknown>(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((item) => (Number.isFinite(item) ? Number(item) : 0));
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function numberOrNull(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? (value as number) : null;
}

import type {
  AssetAudioAnalysisRecord,
  AudioAnalysisResult,
} from "../../shared/audio-analysis-types";

export interface SqlExecutor {
  run(sql: string, params?: unknown[] | Record<string, unknown>): Promise<unknown> | unknown;
}

export const ASSET_AUDIO_ANALYSIS_MIGRATION_SQL = `
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
`;

export async function upsertAssetAudioAnalysis(
  db: SqlExecutor,
  assetId: string,
  analysis: AudioAnalysisResult,
  now = new Date(),
): Promise<AssetAudioAnalysisRecord> {
  const record = toAssetAudioAnalysisRecord(assetId, analysis, now);

  await db.run(
    `
    INSERT INTO asset_audio_analysis (
      asset_id,
      duration_ms,
      sample_rate,
      channels,
      bitrate,
      codec,
      format,
      peak_db,
      rms_db,
      loudness_db,
      silence_start_ms,
      silence_end_ms,
      transient_count,
      zero_crossing_rate,
      spectral_centroid,
      spectral_flatness,
      loop_score,
      classification_json,
      suggested_tags_json,
      waveform_summary_json,
      analyzer_version,
      ignored_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
      duration_ms = excluded.duration_ms,
      sample_rate = excluded.sample_rate,
      channels = excluded.channels,
      bitrate = excluded.bitrate,
      codec = excluded.codec,
      format = excluded.format,
      peak_db = excluded.peak_db,
      rms_db = excluded.rms_db,
      loudness_db = excluded.loudness_db,
      silence_start_ms = excluded.silence_start_ms,
      silence_end_ms = excluded.silence_end_ms,
      transient_count = excluded.transient_count,
      zero_crossing_rate = excluded.zero_crossing_rate,
      spectral_centroid = excluded.spectral_centroid,
      spectral_flatness = excluded.spectral_flatness,
      loop_score = excluded.loop_score,
      classification_json = excluded.classification_json,
      suggested_tags_json = excluded.suggested_tags_json,
      waveform_summary_json = excluded.waveform_summary_json,
      analyzer_version = excluded.analyzer_version,
      updated_at = excluded.updated_at
    `,
    [
      record.assetId,
      record.durationMs,
      record.sampleRate,
      record.channels,
      record.bitrate,
      record.codec,
      record.format,
      record.peakDb,
      record.rmsDb,
      record.loudnessDb,
      record.silenceStartMs,
      record.silenceEndMs,
      record.transientCount,
      record.zeroCrossingRate,
      record.spectralCentroid,
      record.spectralFlatness,
      record.loopScore,
      record.classificationJson,
      record.suggestedTagsJson,
      record.waveformSummaryJson,
      record.analyzerVersion,
      record.ignoredAt,
      record.createdAt,
      record.updatedAt,
    ],
  );

  return record;
}

export async function markAudioAnalysisIgnored(db: SqlExecutor, assetId: string, now = new Date()): Promise<void> {
  await db.run(
    `
    UPDATE asset_audio_analysis
    SET ignored_at = ?, updated_at = ?
    WHERE asset_id = ?
    `,
    [now.toISOString(), now.toISOString(), assetId],
  );
}

export function toAssetAudioAnalysisRecord(
  assetId: string,
  analysis: AudioAnalysisResult,
  now = new Date(),
): AssetAudioAnalysisRecord {
  const timestamp = now.toISOString();

  return {
    assetId,
    durationMs: numberOrNull(analysis.durationMs),
    sampleRate: numberOrNull(analysis.sampleRate),
    channels: numberOrNull(analysis.channels),
    bitrate: numberOrNull(analysis.bitrate),
    codec: analysis.codec ?? null,
    format: analysis.format ?? null,
    peakDb: numberOrNull(analysis.peakDb),
    rmsDb: numberOrNull(analysis.rmsDb),
    loudnessDb: numberOrNull(analysis.loudnessDb),
    silenceStartMs: numberOrNull(analysis.silenceStartMs),
    silenceEndMs: numberOrNull(analysis.silenceEndMs),
    transientCount: numberOrNull(analysis.transientCount),
    zeroCrossingRate: numberOrNull(analysis.zeroCrossingRate),
    spectralCentroid: numberOrNull(analysis.spectralCentroid),
    spectralFlatness: numberOrNull(analysis.spectralFlatness),
    loopScore: numberOrNull(analysis.loopScore),
    classificationJson: JSON.stringify(analysis.classification),
    suggestedTagsJson: JSON.stringify(analysis.suggestedTags),
    waveformSummaryJson: analysis.waveformSummary ? JSON.stringify(analysis.waveformSummary) : null,
    analyzerVersion: analysis.analyzerVersion,
    ignoredAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function numberOrNull(value?: number): number | null {
  return Number.isFinite(value) ? (value as number) : null;
}

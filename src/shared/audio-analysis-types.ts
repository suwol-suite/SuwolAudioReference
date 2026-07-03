export const ANALYZER_VERSION = "local-dsp-rules-v1";

export type AudioClassificationType =
  | "music"
  | "sfx"
  | "ui_sound"
  | "voice"
  | "ambience"
  | "loop_candidate"
  | "retro_8bit_candidate"
  | "retro_16bit_candidate"
  | "unknown";

export type SuggestedTagSource = "filename" | "folder" | "duration" | "analysis" | "metadata";

export type LoopLikelihood = "high" | "medium" | "low" | "unknown";

export interface AudioClassificationCandidate {
  type: AudioClassificationType;
  confidence: number;
  reasons: string[];
}

export interface SuggestedAudioTag {
  tag: string;
  tagKey?: string;
  confidence: number;
  source: SuggestedTagSource;
  reasons: string[];
}

export interface AudioMetadata {
  fileName: string;
  folderName: string;
  extension: string;
  byteLength?: number;
  durationMs?: number;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
  codec?: string;
  format?: string;
}

export interface WaveformBucket {
  min: number;
  max: number;
  peak: number;
  rms: number;
}

export interface WaveformSummary {
  sampleRate: number;
  channels: number;
  bucketSize: number;
  buckets: WaveformBucket[];
}

export interface AudioAnalysisMetrics {
  durationMs?: number;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
  codec?: string;
  format?: string;
  waveformSummary?: WaveformSummary;
  peakDb?: number;
  rmsDb?: number;
  loudnessDb?: number;
  silenceStartMs?: number;
  silenceEndMs?: number;
  transientCount?: number;
  zeroCrossingRate?: number;
  spectralCentroid?: number;
  spectralFlatness?: number;
  rmsVariation?: number;
  loopScore?: number;
}

export interface AudioAnalysisResult extends AudioAnalysisMetrics {
  classification: AudioClassificationCandidate[];
  suggestedTags: SuggestedAudioTag[];
  loopLikelihood: LoopLikelihood;
  analyzerVersion: string;
  warnings: string[];
}

export interface AssetAudioAnalysisRecord {
  assetId: string;
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
  codec: string | null;
  format: string | null;
  peakDb: number | null;
  rmsDb: number | null;
  loudnessDb: number | null;
  silenceStartMs: number | null;
  silenceEndMs: number | null;
  transientCount: number | null;
  zeroCrossingRate: number | null;
  spectralCentroid: number | null;
  spectralFlatness: number | null;
  loopScore: number | null;
  classificationJson: string;
  suggestedTagsJson: string;
  waveformSummaryJson: string | null;
  analyzerVersion: string;
  ignoredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AudioAnalysisInput {
  metadata: AudioMetadata;
  metrics?: AudioAnalysisMetrics;
}

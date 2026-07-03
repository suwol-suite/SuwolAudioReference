import type { AudioClassificationType, LoopLikelihood } from "./audio-analysis-types";
import type { AssetListItem, AssetListQuery, BatchResult } from "./library-types";

export const AUDIO_FEATURE_ANALYZER_VERSION = "local-dsp-features-v1";

export const AUDIO_FEATURE_VECTOR_DIMENSIONS = [
  "duration",
  "dynamicRange",
  "attack",
  "decay",
  "spectralCentroid",
  "spectralCentroidStd",
  "spectralFlatness",
  "spectralRolloff",
  "spectralBandwidth",
  "lowBandRatio",
  "midBandRatio",
  "highBandRatio",
  "transientDensity",
  "rhythmicRepetition",
  "loopBoundarySimilarity",
  "rms",
  "peak",
  "zeroCrossing",
  "rmsVariation",
] as const;

export type AudioFeatureDimension = (typeof AUDIO_FEATURE_VECTOR_DIMENSIONS)[number];

export type SimilarityLabel = "duplicate" | "very_similar" | "similar" | "slightly_similar";

export type SimilarityReasonCode =
  | "duplicate_content_hash"
  | "similar_duration"
  | "similar_loudness"
  | "similar_spectral_shape"
  | "similar_transient_density"
  | "similar_dynamic_range"
  | "same_classification"
  | "overlapping_tags"
  | "loop_boundary_match"
  | "rhythmic_match";

export type LoopAnalysisReasonCode =
  | "loop_boundary_match"
  | "loop_boundary_mismatch"
  | "low_click_risk"
  | "high_click_risk"
  | "no_fade_out"
  | "fade_out_detected"
  | "stable_loop_energy"
  | "short_loop_warning";

export interface LoopAnalysisDetails {
  boundarySimilarity: number;
  clickRisk: number;
  fadeOutRisk: number;
  loopScore: number;
  label: LoopLikelihood;
  reasons: LoopAnalysisReasonCode[];
}

export interface AssetAudioFeatureRecord {
  assetId: string;
  analyzerVersion: string;
  durationMs: number | null;
  dynamicRangeDb: number | null;
  attackTimeMs: number | null;
  decayTimeMs: number | null;
  spectralCentroidMean: number | null;
  spectralCentroidStd: number | null;
  spectralFlatness: number | null;
  spectralRolloffHz: number | null;
  spectralBandwidthHz: number | null;
  lowBandRatio: number | null;
  midBandRatio: number | null;
  highBandRatio: number | null;
  transientDensity: number | null;
  rhythmicRepetitionScore: number | null;
  loopBoundarySimilarity: number | null;
  loopClickRisk: number | null;
  loopFadeOutRisk: number | null;
  waveformShapeHash: string | null;
  featureVector: number[];
  loopReasons: LoopAnalysisReasonCode[];
  createdAt: string;
  updatedAt: string;
}

export interface FeatureRerunBatchInput {
  assetIds?: string[];
  query?: AssetListQuery;
  onlyOutdated?: boolean;
  limit?: number;
}

export interface FeatureRerunBatchResult extends BatchResult {
  updatedAssetIds: string[];
}

export interface SimilarityReason {
  code: SimilarityReasonCode;
  weight: number;
}

export interface SimilarityCandidate {
  asset: AssetListItem;
  feature: AssetAudioFeatureRecord | null;
  score: number;
  label: SimilarityLabel;
  duplicate: boolean;
  reasons: SimilarityReason[];
  sharedTagNames: string[];
  primaryClassification: AudioClassificationType | "unknown";
}

export interface SimilaritySearchInput {
  assetId: string;
  limit?: number;
  threshold?: number;
  prefilterLimit?: number;
}

export interface SimilaritySearchResult {
  assetId: string;
  feature: AssetAudioFeatureRecord | null;
  candidates: SimilarityCandidate[];
  analyzerVersion: string;
  searchedAt: string;
  warnings: string[];
}

export interface SimilarityExplanation {
  assetId: string;
  candidateAssetId: string;
  score: number;
  label: SimilarityLabel;
  duplicate: boolean;
  reasons: SimilarityReason[];
}

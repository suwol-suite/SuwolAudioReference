import type { AudioClassificationType } from "../../shared/audio-analysis-types";
import {
  AUDIO_FEATURE_ANALYZER_VERSION,
  type AssetAudioFeatureRecord,
  type SimilarityCandidate,
  type SimilarityExplanation,
  type SimilarityReason,
  type SimilaritySearchInput,
  type SimilaritySearchResult,
} from "../../shared/audio-feature-types";
import type { AssetListItem } from "../../shared/library-types";
import {
  type AssetAudioFeatureRow,
  mapAssetAudioFeatureRow,
} from "./audio-feature-repository";
import { AudioFeatureService } from "./audio-feature-service";
import type { AssetService } from "./asset-service";
import type { LibraryService } from "./library-service";
import { clamp, clamp01 } from "./waveform-service";

export interface SimilarityComponentScores {
  cosine: number;
  duration: number;
  spectral: number;
  transient: number;
  loudness: number;
  dynamicRange: number;
  classBonus: number;
  tagBonus: number;
  loopBonus: number;
  rhythmBonus: number;
}

export class AudioSimilarityService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly featureService: AudioFeatureService,
  ) {}

  async findForAsset(input: SimilaritySearchInput): Promise<SimilaritySearchResult> {
    const context = this.libraryService.requireActive();
    const asset = await this.assetService.getAsset(input.assetId);
    const warnings: string[] = [];
    if (!asset) {
      throw new Error("ASSET_NOT_FOUND");
    }

    const feature = await this.featureService.ensureCurrent(input.assetId);
    if (!feature) {
      return {
        assetId: input.assetId,
        feature: null,
        candidates: [],
        analyzerVersion: AUDIO_FEATURE_ANALYZER_VERSION,
        searchedAt: new Date().toISOString(),
        warnings: ["feature_missing"],
      };
    }

    const rows = prefilterSimilarityCandidateRows(
      context.db.all<AssetAudioFeatureRow>(
        `
        SELECT f.*
        FROM asset_audio_features f
        JOIN assets a ON a.id = f.asset_id
        WHERE a.library_id = ?
          AND a.id <> ?
          AND a.media_type = 'audio'
          AND a.trashed_at IS NULL
        ORDER BY
          CASE
            WHEN ? IS NULL OR f.duration_ms IS NULL THEN 999999999
            ELSE ABS(f.duration_ms - ?)
          END ASC,
          f.updated_at DESC
        LIMIT ?
        `,
        [
          context.library.id,
          input.assetId,
          feature.durationMs,
          feature.durationMs,
          Math.max(10, Math.min(input.prefilterLimit ?? 500, 2000)),
        ],
      ),
      feature,
      input.prefilterLimit ?? 500,
    );

    const candidates: SimilarityCandidate[] = [];
    for (const row of rows) {
      const candidateFeature = mapAssetAudioFeatureRow(row);
      const candidateAsset = await this.assetService.getAsset(candidateFeature.assetId);
      if (!candidateAsset || candidateAsset.trashedAt) {
        continue;
      }
      const candidate = createSimilarityCandidate(asset, feature, candidateAsset, candidateFeature);
      if (candidate.duplicate || candidate.score >= (input.threshold ?? 0.55)) {
        candidates.push(candidate);
      }
    }

    candidates.sort((left, right) => Number(right.duplicate) - Number(left.duplicate) || right.score - left.score);

    return {
      assetId: input.assetId,
      feature,
      candidates: candidates.slice(0, Math.max(1, Math.min(input.limit ?? 10, 50))),
      analyzerVersion: AUDIO_FEATURE_ANALYZER_VERSION,
      searchedAt: new Date().toISOString(),
      warnings,
    };
  }

  async explain(assetId: string, candidateAssetId: string): Promise<SimilarityExplanation> {
    const asset = await this.assetService.getAsset(assetId);
    const candidateAsset = await this.assetService.getAsset(candidateAssetId);
    const feature = await this.featureService.ensureCurrent(assetId);
    const candidateFeature = await this.featureService.ensureCurrent(candidateAssetId);
    if (!asset || !candidateAsset || !feature || !candidateFeature) {
      throw new Error("SIMILARITY_SEARCH_FAILED");
    }
    const candidate = createSimilarityCandidate(asset, feature, candidateAsset, candidateFeature);
    return {
      assetId,
      candidateAssetId,
      score: candidate.score,
      label: candidate.label,
      duplicate: candidate.duplicate,
      reasons: candidate.reasons,
    };
  }
}

export function prefilterSimilarityCandidateRows(
  rows: AssetAudioFeatureRow[],
  baseFeature: AssetAudioFeatureRecord,
  limit: number,
): AssetAudioFeatureRow[] {
  const baseDuration = baseFeature.durationMs;
  const bounded = rows.filter((row) => {
    if (!baseDuration || !row.duration_ms) {
      return true;
    }
    const ratio = row.duration_ms / baseDuration;
    return ratio >= 0.35 && ratio <= 2.75;
  });
  return bounded.slice(0, Math.max(1, Math.min(limit, 2000)));
}

export function createSimilarityCandidate(
  asset: AssetListItem,
  feature: AssetAudioFeatureRecord,
  candidateAsset: AssetListItem,
  candidateFeature: AssetAudioFeatureRecord,
): SimilarityCandidate {
  const sharedTagNames = findSharedTagNames(asset, candidateAsset);
  const primaryClassification = getPrimaryClassification(candidateAsset);
  const duplicate = asset.contentHash === candidateAsset.contentHash;
  const componentScores = calculateSimilarityComponents(asset, feature, candidateAsset, candidateFeature);
  const score = calculateSimilarityScore(componentScores, duplicate);
  const reasons = createSimilarityReasons(
    asset,
    feature,
    candidateAsset,
    candidateFeature,
    componentScores,
    duplicate,
    sharedTagNames,
  );

  return {
    asset: candidateAsset,
    feature: candidateFeature,
    score,
    label: labelSimilarityScore(score, duplicate),
    duplicate,
    reasons,
    sharedTagNames,
    primaryClassification,
  };
}

export function calculateSimilarityScore(componentScores: SimilarityComponentScores, duplicate = false): number {
  const score =
    componentScores.cosine * 0.42 +
    componentScores.duration * 0.15 +
    componentScores.spectral * 0.14 +
    componentScores.transient * 0.08 +
    componentScores.loudness * 0.08 +
    componentScores.dynamicRange * 0.04 +
    componentScores.classBonus +
    componentScores.tagBonus +
    componentScores.loopBonus +
    componentScores.rhythmBonus;
  return duplicate ? Math.max(0.98, clamp01(score)) : clamp01(score);
}

export function calculateSimilarityComponents(
  asset: AssetListItem,
  feature: AssetAudioFeatureRecord,
  candidateAsset: AssetListItem,
  candidateFeature: AssetAudioFeatureRecord,
): SimilarityComponentScores {
  const sameClass =
    getPrimaryClassification(asset) !== "unknown" && getPrimaryClassification(asset) === getPrimaryClassification(candidateAsset);
  const sharedTags = findSharedTagNames(asset, candidateAsset);
  const loopBoundaryDiff = Math.abs((feature.loopBoundarySimilarity ?? 0) - (candidateFeature.loopBoundarySimilarity ?? 0));
  const rhythmDiff = Math.abs((feature.rhythmicRepetitionScore ?? 0) - (candidateFeature.rhythmicRepetitionScore ?? 0));

  return {
    cosine: cosineSimilarity(feature.featureVector, candidateFeature.featureVector),
    duration: durationSimilarity(feature.durationMs, candidateFeature.durationMs),
    spectral: spectralSimilarity(feature, candidateFeature),
    transient: rangeSimilarity(feature.transientDensity, candidateFeature.transientDensity, 5),
    loudness: loudnessSimilarity(asset, candidateAsset),
    dynamicRange: rangeSimilarity(feature.dynamicRangeDb, candidateFeature.dynamicRangeDb, 24),
    classBonus: sameClass ? 0.055 : 0,
    tagBonus: Math.min(0.06, sharedTags.length * 0.025),
    loopBonus: loopBoundaryDiff <= 0.16 ? 0.035 : 0,
    rhythmBonus: rhythmDiff <= 0.16 ? 0.025 : 0,
  };
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(left[index]) ? (left[index] as number) : 0;
    const rightValue = Number.isFinite(right[index]) ? (right[index] as number) : 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude <= 1e-9 || rightMagnitude <= 1e-9) {
    return 0;
  }

  return clamp01(dot / Math.sqrt(leftMagnitude * rightMagnitude));
}

export function labelSimilarityScore(score: number, duplicate = false): SimilarityCandidate["label"] {
  if (duplicate) {
    return "duplicate";
  }
  if (score >= 0.86) {
    return "very_similar";
  }
  if (score >= 0.72) {
    return "similar";
  }
  return "slightly_similar";
}

export function createSimilarityReasons(
  asset: AssetListItem,
  feature: AssetAudioFeatureRecord,
  candidateAsset: AssetListItem,
  candidateFeature: AssetAudioFeatureRecord,
  scores: SimilarityComponentScores,
  duplicate: boolean,
  sharedTagNames = findSharedTagNames(asset, candidateAsset),
): SimilarityReason[] {
  const reasons: SimilarityReason[] = [];

  if (duplicate) {
    reasons.push({ code: "duplicate_content_hash", weight: 1 });
  }
  if (scores.duration >= 0.78) {
    reasons.push({ code: "similar_duration", weight: scores.duration });
  }
  if (scores.loudness >= 0.72) {
    reasons.push({ code: "similar_loudness", weight: scores.loudness });
  }
  if (scores.spectral >= 0.72) {
    reasons.push({ code: "similar_spectral_shape", weight: scores.spectral });
  }
  if (scores.transient >= 0.72) {
    reasons.push({ code: "similar_transient_density", weight: scores.transient });
  }
  if (scores.dynamicRange >= 0.72) {
    reasons.push({ code: "similar_dynamic_range", weight: scores.dynamicRange });
  }
  if (scores.classBonus > 0) {
    reasons.push({ code: "same_classification", weight: scores.classBonus / 0.055 });
  }
  if (sharedTagNames.length > 0) {
    reasons.push({ code: "overlapping_tags", weight: Math.max(1.01, clamp01(sharedTagNames.length / 3)) });
  }
  if (Math.abs((feature.loopBoundarySimilarity ?? 0) - (candidateFeature.loopBoundarySimilarity ?? 0)) <= 0.16) {
    reasons.push({ code: "loop_boundary_match", weight: 1 });
  }
  if (scores.rhythmBonus > 0) {
    reasons.push({ code: "rhythmic_match", weight: scores.rhythmBonus / 0.025 });
  }

  return reasons
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 7);
}

function durationSimilarity(left: number | null, right: number | null): number {
  if (!left || !right || left <= 0 || right <= 0) {
    return 0;
  }
  return 1 - clamp(Math.abs(Math.log(left / right)) / Math.log(3), 0, 1);
}

function spectralSimilarity(left: AssetAudioFeatureRecord, right: AssetAudioFeatureRecord): number {
  const centroid = rangeSimilarity(left.spectralCentroidMean, right.spectralCentroidMean, 5000);
  const std = rangeSimilarity(left.spectralCentroidStd, right.spectralCentroidStd, 3000);
  const flatness = rangeSimilarity(left.spectralFlatness, right.spectralFlatness, 0.65);
  const rolloff = rangeSimilarity(left.spectralRolloffHz, right.spectralRolloffHz, 7000);
  const band =
    (rangeSimilarity(left.lowBandRatio, right.lowBandRatio, 0.65) +
      rangeSimilarity(left.midBandRatio, right.midBandRatio, 0.65) +
      rangeSimilarity(left.highBandRatio, right.highBandRatio, 0.65)) /
    3;
  return clamp01(centroid * 0.28 + std * 0.18 + flatness * 0.18 + rolloff * 0.16 + band * 0.2);
}

function loudnessSimilarity(left: AssetListItem, right: AssetListItem): number {
  const rms = rangeSimilarity(left.audioAnalysis?.rmsDb ?? null, right.audioAnalysis?.rmsDb ?? null, 18);
  const peak = rangeSimilarity(left.audioAnalysis?.peakDb ?? null, right.audioAnalysis?.peakDb ?? null, 18);
  return clamp01(rms * 0.65 + peak * 0.35);
}

function rangeSimilarity(left: number | null | undefined, right: number | null | undefined, maxDelta: number): number {
  if (!Number.isFinite(left) || !Number.isFinite(right) || maxDelta <= 0) {
    return 0;
  }
  return 1 - clamp(Math.abs((left as number) - (right as number)) / maxDelta, 0, 1);
}

function findSharedTagNames(left: AssetListItem, right: AssetListItem): string[] {
  const rightNames = new Set(right.tags.map((tag) => tag.name.trim().toLocaleLowerCase("ko-KR")));
  return left.tags
    .map((tag) => tag.name)
    .filter((name) => rightNames.has(name.trim().toLocaleLowerCase("ko-KR")));
}

function getPrimaryClassification(asset: AssetListItem): AudioClassificationType | "unknown" {
  return asset.audioAnalysis?.classification[0]?.type ?? "unknown";
}

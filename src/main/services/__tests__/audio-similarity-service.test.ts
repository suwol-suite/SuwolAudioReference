import { describe, expect, it } from "vitest";
import type { AssetAudioFeatureRecord } from "../../../shared/audio-feature-types";
import type { AssetListItem, TagRecord } from "../../../shared/library-types";
import type { AssetAudioFeatureRow } from "../audio-feature-repository";
import { createAudioFeatureRecord } from "../audio-feature-service";
import {
  calculateSimilarityScore,
  cosineSimilarity,
  createSimilarityCandidate,
  createSimilarityReasons,
  prefilterSimilarityCandidateRows,
} from "../audio-similarity-service";

describe("audio-similarity-service", () => {
  it("keeps cosine and aggregate scores in the 0-1 range", () => {
    expect(cosineSimilarity([1, 0.5, 0], [1, 0.5, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([Number.NaN, Infinity], [1, 1])).toBe(0);
    expect(
      calculateSimilarityScore({
        cosine: 1,
        duration: 1,
        spectral: 1,
        transient: 1,
        loudness: 1,
        dynamicRange: 1,
        classBonus: 0.5,
        tagBonus: 0.5,
        loopBonus: 0.5,
        rhythmBonus: 0.5,
      }),
    ).toBeLessThanOrEqual(1);
  });

  it("scores identical non-duplicate sounds high", () => {
    const left = createAsset("left", "left.wav", "hash-a");
    const right = createAsset("right", "right.wav", "hash-b");
    const candidate = createSimilarityCandidate(left, createFeature("left", 1200), right, createFeature("right", 1200));

    expect(candidate.duplicate).toBe(false);
    expect(candidate.score).toBeGreaterThan(0.86);
    expect(candidate.label).toBe("very_similar");
  });

  it("penalizes very different durations", () => {
    const left = createAsset("left", "left.wav", "hash-a", 1200);
    const shortMatch = createAsset("right", "right.wav", "hash-b", 1300);
    const longCandidate = createAsset("long", "long.wav", "hash-c", 90000);

    const close = createSimilarityCandidate(left, createFeature("left", 1200), shortMatch, createFeature("right", 1300));
    const far = createSimilarityCandidate(left, createFeature("left", 1200), longCandidate, createFeature("long", 90000));

    expect(far.score).toBeLessThan(close.score);
  });

  it("marks same content hashes as duplicates instead of only similar", () => {
    const left = createAsset("left", "left.wav", "same-hash");
    const right = createAsset("right", "right.wav", "same-hash");
    const candidate = createSimilarityCandidate(left, createFeature("left", 1200), right, createFeature("right", 1200));

    expect(candidate.duplicate).toBe(true);
    expect(candidate.label).toBe("duplicate");
    expect(candidate.score).toBeGreaterThanOrEqual(0.98);
    expect(candidate.reasons.map((reason) => reason.code)).toContain("duplicate_content_hash");
  });

  it("limits prefilter rows and rejects extreme duration ratios", () => {
    const rows = [
      createRow("a", 1000),
      createRow("b", 1200),
      createRow("c", 90000),
      createRow("d", 1400),
    ];
    const filtered = prefilterSimilarityCandidateRows(rows, createFeature("base", 1000), 2);

    expect(filtered.map((row) => row.asset_id)).toEqual(["a", "b"]);
  });

  it("generates readable reasons without mutating tags", () => {
    const left = createAsset("left", "left.wav", "hash-a");
    const right = createAsset("right", "right.wav", "hash-b");
    const beforeTags = right.tags.map((tag) => tag.name);
    const candidate = createSimilarityCandidate(left, createFeature("left", 1200), right, createFeature("right", 1200));
    const reasons = createSimilarityReasons(
      left,
      createFeature("left", 1200),
      right,
      createFeature("right", 1200),
      {
        cosine: 1,
        duration: 1,
        spectral: 1,
        transient: 1,
        loudness: 1,
        dynamicRange: 1,
        classBonus: 0.055,
        tagBonus: 0.025,
        loopBonus: 0.035,
        rhythmBonus: 0.025,
      },
      false,
    );

    expect(candidate.sharedTagNames).toEqual(["ui"]);
    expect(reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["similar_duration", "same_classification", "overlapping_tags"]),
    );
    expect(right.tags.map((tag) => tag.name)).toEqual(beforeTags);
  });
});

function createFeature(assetId: string, durationMs: number): AssetAudioFeatureRecord {
  return createAudioFeatureRecord(assetId, {
    durationMs,
    sampleRate: 1000,
    channels: 1,
    peakDb: -3,
    rmsDb: -14,
    spectralCentroid: 1600,
    spectralFlatness: 0.2,
    transientCount: 4,
    zeroCrossingRate: 0.08,
    rmsVariation: 0.2,
    loopScore: 0.74,
    waveformSummary: {
      sampleRate: 1000,
      channels: 1,
      bucketSize: 100,
      buckets: [0.2, 0.5, 0.7, 0.4, 0.2, 0.5].map((value) => ({
        min: -value,
        max: value,
        peak: value,
        rms: value * 0.7,
      })),
    },
    classification: [{ type: "ui_sound", confidence: 0.8, reasons: [] }],
    suggestedTags: [],
    loopLikelihood: "high",
    analyzerVersion: "test",
    warnings: [],
  });
}

function createAsset(id: string, fileName: string, contentHash: string, durationMs = 1200): AssetListItem {
  const tag = createTag("tag-ui", "ui");
  return {
    id,
    libraryId: "library",
    originalPath: fileName,
    storedPath: fileName,
    fileName,
    fileExt: "wav",
    fileSize: 44,
    contentHash,
    importMode: "copy",
    mediaType: "audio",
    title: null,
    memo: "",
    rating: 0,
    favorite: false,
    trashedAt: null,
    lastPlayedAt: null,
    playCount: 0,
    playbackSupported: null,
    playbackErrorCode: null,
    fileMissing: false,
    fileMissingCheckedAt: null,
    relinkedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: [tag],
    collections: [],
    audioAnalysis: {
      durationMs,
      peakDb: -3,
      rmsDb: -14,
      classification: [{ type: "ui_sound", confidence: 0.8, reasons: [] }],
      suggestedTags: [],
      loopLikelihood: "high",
      analyzerVersion: "test",
      warnings: [],
    },
    playable: true,
    playbackSupportReason: null,
    duplicateCount: 1,
  };
}

function createTag(id: string, name: string): TagRecord {
  return {
    id,
    libraryId: "library",
    name,
    color: "#55c7a5",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createRow(assetId: string, durationMs: number): AssetAudioFeatureRow {
  return {
    asset_id: assetId,
    analyzer_version: "test",
    duration_ms: durationMs,
    dynamic_range_db: 10,
    attack_time_ms: 10,
    decay_time_ms: 20,
    spectral_centroid_mean: 1000,
    spectral_centroid_std: 100,
    spectral_flatness: 0.2,
    spectral_rolloff_hz: 2000,
    spectral_bandwidth_hz: 400,
    low_band_ratio: 0.3,
    mid_band_ratio: 0.4,
    high_band_ratio: 0.3,
    transient_density: 1,
    rhythmic_repetition_score: 0.5,
    loop_boundary_similarity: 0.7,
    loop_click_risk: 0.1,
    loop_fade_out_risk: 0.1,
    waveform_shape_hash: "shape",
    feature_vector_json: "[]",
    loop_reasons_json: "[]",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

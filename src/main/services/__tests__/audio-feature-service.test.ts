import { describe, expect, it } from "vitest";
import type { AudioAnalysisResult, WaveformBucket } from "../../../shared/audio-analysis-types";
import { AUDIO_FEATURE_ANALYZER_VERSION, AUDIO_FEATURE_VECTOR_DIMENSIONS } from "../../../shared/audio-feature-types";
import {
  createAudioFeatureRecord,
  needsFeatureReanalysis,
  normalizeFeatureVector,
} from "../audio-feature-service";
import { analyzeLoopFromSummary } from "../audio-loop-analysis-service";

describe("audio-feature-service", () => {
  it("normalizes feature vectors without NaN or Infinity", () => {
    const feature = createAudioFeatureRecord("asset-a", createAnalysis());

    expect(feature.featureVector).toHaveLength(AUDIO_FEATURE_VECTOR_DIMENSIONS.length);
    expect(feature.featureVector.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(feature.waveformShapeHash).toHaveLength(20);
  });

  it("guards feature normalization from invalid numbers", () => {
    const vector = normalizeFeatureVector({
      durationMs: Number.POSITIVE_INFINITY,
      dynamicRangeDb: Number.NaN,
      attackTimeMs: null,
      decayTimeMs: undefined as never,
      spectralCentroidMean: Number.NEGATIVE_INFINITY,
      spectralCentroidStd: null,
      spectralFlatness: 2,
      spectralRolloffHz: null,
      spectralBandwidthHz: null,
      lowBandRatio: 0.2,
      midBandRatio: 0.3,
      highBandRatio: 0.5,
      transientDensity: Number.NaN,
      rhythmicRepetitionScore: 4,
      loopBoundarySimilarity: -1,
      rmsDb: Number.NaN,
      peakDb: null,
      zeroCrossingRate: undefined as never,
      rmsVariation: null,
    });

    expect(vector).toHaveLength(AUDIO_FEATURE_VECTOR_DIMENSIONS.length);
    expect(vector.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
  });

  it("explains loop boundary, fade-out, and click risk", () => {
    const loop = analyzeLoopFromSummary(createAnalysis());
    const faded = analyzeLoopFromSummary(
      createAnalysis({
        waveformSummary: {
          sampleRate: 1000,
          channels: 1,
          bucketSize: 100,
          buckets: createBuckets([0.4, 0.45, 0.42, 0.38, 0.28, 0.12, 0.04, 0.01]),
        },
      }),
    );

    expect(loop.boundarySimilarity).toBeGreaterThan(0.6);
    expect(loop.clickRisk).toBeLessThan(0.5);
    expect(loop.reasons).toContain("loop_boundary_match");
    expect(faded.fadeOutRisk).toBeGreaterThan(loop.fadeOutRisk);
    expect(faded.reasons).toContain("fade_out_detected");
  });

  it("detects outdated feature analyzer versions", () => {
    const current = createAudioFeatureRecord("asset-a", createAnalysis());
    expect(needsFeatureReanalysis(null)).toBe(true);
    expect(needsFeatureReanalysis({ ...current, analyzerVersion: "old" })).toBe(true);
    expect(needsFeatureReanalysis({ ...current, analyzerVersion: AUDIO_FEATURE_ANALYZER_VERSION })).toBe(false);
  });
});

function createAnalysis(overrides: Partial<AudioAnalysisResult> = {}): AudioAnalysisResult {
  return {
    durationMs: 1200,
    sampleRate: 1000,
    channels: 1,
    format: "wav",
    codec: "pcm_s16le",
    peakDb: -2,
    rmsDb: -13,
    loudnessDb: -13,
    silenceStartMs: 20,
    silenceEndMs: 30,
    transientCount: 4,
    zeroCrossingRate: 0.08,
    spectralCentroid: 1800,
    spectralFlatness: 0.22,
    rmsVariation: 0.2,
    loopScore: 0.72,
    waveformSummary: {
      sampleRate: 1000,
      channels: 1,
      bucketSize: 100,
      buckets: createBuckets([0.22, 0.42, 0.65, 0.5, 0.28, 0.22, 0.42, 0.65, 0.22, 0.42]),
    },
    classification: [{ type: "sfx", confidence: 0.8, reasons: [] }],
    suggestedTags: [],
    loopLikelihood: "high",
    analyzerVersion: "test",
    warnings: [],
    ...overrides,
  };
}

function createBuckets(values: number[]): WaveformBucket[] {
  return values.map((value) => ({
    min: -value,
    max: value,
    peak: value,
    rms: value * 0.7,
  }));
}

import { createHash } from "node:crypto";
import type { AudioAnalysisResult, WaveformBucket } from "../../shared/audio-analysis-types";
import {
  AUDIO_FEATURE_ANALYZER_VERSION,
  AUDIO_FEATURE_VECTOR_DIMENSIONS,
  type AssetAudioFeatureRecord,
  type FeatureRerunBatchInput,
  type FeatureRerunBatchResult,
} from "../../shared/audio-feature-types";
import { createBatchResult, recordFailure, recordSkipped, recordSuccess } from "./batch-result";
import {
  getAssetAudioFeature,
  upsertAssetAudioFeature,
} from "./audio-feature-repository";
import { analyzeLoopFromSummary } from "./audio-loop-analysis-service";
import type { AnalysisAppService } from "./analysis-app-service";
import type { AssetService } from "./asset-service";
import type { LibraryService } from "./library-service";
import { clamp, clamp01 } from "./waveform-service";

export class AudioFeatureService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly analysisService?: AnalysisAppService,
  ) {}

  async get(assetId: string): Promise<AssetAudioFeatureRecord | null> {
    const context = this.libraryService.requireActive();
    return getAssetAudioFeature(context.db, assetId);
  }

  async ensureCurrent(assetId: string): Promise<AssetAudioFeatureRecord | null> {
    const existing = await this.get(assetId);
    if (existing?.analyzerVersion === AUDIO_FEATURE_ANALYZER_VERSION) {
      return existing;
    }
    return this.rerun(assetId);
  }

  async rerun(assetId: string): Promise<AssetAudioFeatureRecord | null> {
    const context = this.libraryService.requireActive();
    const asset = await this.assetService.getAsset(assetId);
    if (!asset || asset.mediaType !== "audio") {
      return null;
    }

    let analysis = await this.assetService.getAnalysis(assetId);
    if (!analysis && this.analysisService) {
      analysis = await this.analysisService.rerun(assetId);
    }
    if (!analysis) {
      return null;
    }

    return this.saveFromAnalysis(assetId, analysis);
  }

  async saveFromAnalysis(assetId: string, analysis: AudioAnalysisResult): Promise<AssetAudioFeatureRecord> {
    const context = this.libraryService.requireActive();
    const feature = createAudioFeatureRecord(assetId, analysis);
    return upsertAssetAudioFeature(context.db, feature);
  }

  async rerunBatch(input: FeatureRerunBatchInput = {}): Promise<FeatureRerunBatchResult> {
    const query = input.query ?? {};
    const assets = input.assetIds?.length
      ? (await Promise.all(input.assetIds.map((assetId) => this.assetService.getAsset(assetId)))).filter(
          (asset): asset is NonNullable<typeof asset> => Boolean(asset),
        )
      : await this.assetService.listAssets({ ...query, includeTrashed: query.includeTrashed ?? false });
    const audioAssets = assets.filter((asset) => asset?.mediaType === "audio").slice(0, Math.max(1, input.limit ?? 1000));
    const result: FeatureRerunBatchResult = {
      ...createBatchResult(audioAssets.length),
      updatedAssetIds: [],
    };

    for (const asset of audioAssets) {
      if (!asset) {
        continue;
      }
      try {
        const existing = await this.get(asset.id);
        if (input.onlyOutdated && existing?.analyzerVersion === AUDIO_FEATURE_ANALYZER_VERSION) {
          recordSkipped(result);
          continue;
        }
        const feature = await this.rerun(asset.id);
        if (feature) {
          recordSuccess(result);
          result.updatedAssetIds.push(asset.id);
        } else {
          recordSkipped(result);
        }
      } catch (error) {
        recordFailure(result, asset.id, error instanceof Error ? error.message : String(error));
      }
    }

    return result;
  }
}

export function createAudioFeatureRecord(
  assetId: string,
  analysis: AudioAnalysisResult,
  now = new Date(),
): AssetAudioFeatureRecord {
  const buckets = analysis.waveformSummary?.buckets ?? [];
  const durationMs = finiteOrNull(analysis.durationMs);
  const peakDb = finiteOrNull(analysis.peakDb);
  const rmsDb = finiteOrNull(analysis.rmsDb);
  const dynamicRangeDb =
    peakDb !== null && rmsDb !== null ? finiteOrNull(clamp(peakDb - rmsDb, 0, 120)) : null;
  const envelope = buckets.map((bucket) => sanitize01(Math.max(bucket.peak, bucket.rms)));
  const centroidMean = finiteOrNull(analysis.spectralCentroid ?? estimateCentroidFromEnvelope(envelope, analysis.sampleRate));
  const centroidStd = finiteOrNull(estimateCentroidStdFromEnvelope(envelope, analysis.sampleRate));
  const bandRatios = calculateBandEnergyRatios(buckets);
  const transientDensity =
    Number.isFinite(analysis.transientCount) && durationMs && durationMs > 0
      ? finiteOrNull((analysis.transientCount as number) / (durationMs / 1000))
      : null;
  const loop = analyzeLoopFromSummary(analysis);
  const rhythmicRepetitionScore = finiteOrNull(calculateRhythmicRepetitionScore(envelope));
  const attackTimeMs = finiteOrNull(estimateAttackTimeMs(envelope, durationMs));
  const decayTimeMs = finiteOrNull(estimateDecayTimeMs(envelope, durationMs));
  const spectralRolloffHz = finiteOrNull(estimateRolloffFromEnvelope(envelope, analysis.sampleRate));
  const spectralBandwidthHz = finiteOrNull(estimateBandwidthFromEnvelope(envelope, analysis.sampleRate));
  const featureVector = normalizeFeatureVector({
    durationMs,
    dynamicRangeDb,
    attackTimeMs,
    decayTimeMs,
    spectralCentroidMean: centroidMean,
    spectralCentroidStd: centroidStd,
    spectralFlatness: finiteOrNull(analysis.spectralFlatness),
    spectralRolloffHz,
    spectralBandwidthHz,
    lowBandRatio: bandRatios.low,
    midBandRatio: bandRatios.mid,
    highBandRatio: bandRatios.high,
    transientDensity,
    rhythmicRepetitionScore,
    loopBoundarySimilarity: loop.boundarySimilarity,
    rmsDb,
    peakDb,
    zeroCrossingRate: finiteOrNull(analysis.zeroCrossingRate),
    rmsVariation: finiteOrNull(analysis.rmsVariation),
  });
  const timestamp = now.toISOString();

  return {
    assetId,
    analyzerVersion: AUDIO_FEATURE_ANALYZER_VERSION,
    durationMs,
    dynamicRangeDb,
    attackTimeMs,
    decayTimeMs,
    spectralCentroidMean: centroidMean,
    spectralCentroidStd: centroidStd,
    spectralFlatness: finiteOrNull(analysis.spectralFlatness),
    spectralRolloffHz,
    spectralBandwidthHz,
    lowBandRatio: bandRatios.low,
    midBandRatio: bandRatios.mid,
    highBandRatio: bandRatios.high,
    transientDensity,
    rhythmicRepetitionScore,
    loopBoundarySimilarity: loop.boundarySimilarity,
    loopClickRisk: loop.clickRisk,
    loopFadeOutRisk: loop.fadeOutRisk,
    waveformShapeHash: createWaveformShapeHash(envelope),
    featureVector,
    loopReasons: loop.reasons,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeFeatureVector(input: {
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
  rmsDb: number | null;
  peakDb: number | null;
  zeroCrossingRate: number | null;
  rmsVariation: number | null;
}): number[] {
  const values = [
    normalizeDuration(input.durationMs),
    normalizeRange(input.dynamicRangeDb, 0, 60),
    1 - normalizeRange(input.attackTimeMs, 0, 2000),
    normalizeRange(input.decayTimeMs, 0, 5000),
    normalizeRange(input.spectralCentroidMean, 0, 10000),
    normalizeRange(input.spectralCentroidStd, 0, 5000),
    sanitize01(input.spectralFlatness),
    normalizeRange(input.spectralRolloffHz, 0, 16000),
    normalizeRange(input.spectralBandwidthHz, 0, 10000),
    sanitize01(input.lowBandRatio),
    sanitize01(input.midBandRatio),
    sanitize01(input.highBandRatio),
    normalizeRange(input.transientDensity, 0, 10),
    sanitize01(input.rhythmicRepetitionScore),
    sanitize01(input.loopBoundarySimilarity),
    normalizeDb(input.rmsDb),
    normalizeDb(input.peakDb),
    sanitize01(input.zeroCrossingRate),
    sanitize01(input.rmsVariation),
  ];

  return AUDIO_FEATURE_VECTOR_DIMENSIONS.map((_, index) => sanitize01(values[index] ?? 0));
}

export function needsFeatureReanalysis(feature: AssetAudioFeatureRecord | null | undefined): boolean {
  return !feature || feature.analyzerVersion !== AUDIO_FEATURE_ANALYZER_VERSION;
}

function estimateAttackTimeMs(envelope: number[], durationMs: number | null): number | null {
  if (envelope.length === 0 || !durationMs) {
    return null;
  }
  const peak = Math.max(...envelope);
  const threshold = Math.max(0.05, peak * 0.65);
  const index = envelope.findIndex((value) => value >= threshold);
  return index >= 0 ? (index / Math.max(1, envelope.length - 1)) * durationMs : durationMs;
}

function estimateDecayTimeMs(envelope: number[], durationMs: number | null): number | null {
  if (envelope.length === 0 || !durationMs) {
    return null;
  }
  const peak = Math.max(...envelope);
  const threshold = Math.max(0.04, peak * 0.45);
  let lastLoudIndex = -1;
  for (let index = envelope.length - 1; index >= 0; index -= 1) {
    if ((envelope[index] ?? 0) >= threshold) {
      lastLoudIndex = index;
      break;
    }
  }
  return lastLoudIndex >= 0 ? ((envelope.length - 1 - lastLoudIndex) / Math.max(1, envelope.length - 1)) * durationMs : 0;
}

function calculateBandEnergyRatios(buckets: WaveformBucket[]): { low: number | null; mid: number | null; high: number | null } {
  if (buckets.length === 0) {
    return { low: null, mid: null, high: null };
  }
  const thirds = [0, 0, 0];
  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index]!;
    const third = Math.min(2, Math.floor((index / buckets.length) * 3));
    thirds[third] += bucket.rms * bucket.rms + bucket.peak * bucket.peak * 0.25;
  }
  const total = thirds.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-9) {
    return { low: 0, mid: 0, high: 0 };
  }
  return {
    low: thirds[0] / total,
    mid: thirds[1] / total,
    high: thirds[2] / total,
  };
}

function calculateRhythmicRepetitionScore(envelope: number[]): number {
  if (envelope.length < 12) {
    return 0;
  }
  const normalized = normalizeEnvelope(envelope);
  let best = 0;
  const minLag = Math.max(2, Math.floor(envelope.length * 0.06));
  const maxLag = Math.max(minLag, Math.floor(envelope.length * 0.5));
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    let count = 0;
    for (let index = lag; index < normalized.length; index += 1) {
      score += 1 - Math.abs((normalized[index] ?? 0) - (normalized[index - lag] ?? 0));
      count += 1;
    }
    best = Math.max(best, count > 0 ? score / count : 0);
  }
  return clamp01(best);
}

function estimateCentroidFromEnvelope(envelope: number[], sampleRate?: number): number | null {
  if (envelope.length === 0 || !sampleRate) {
    return null;
  }
  const weighted = envelope.reduce((sum, value, index) => sum + value * index, 0);
  const total = envelope.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-9) {
    return 0;
  }
  return (weighted / total / Math.max(1, envelope.length - 1)) * (sampleRate / 2);
}

function estimateCentroidStdFromEnvelope(envelope: number[], sampleRate?: number): number | null {
  if (envelope.length === 0 || !sampleRate) {
    return null;
  }
  const centroid = estimateCentroidFromEnvelope(envelope, sampleRate) ?? 0;
  const nyquist = sampleRate / 2;
  const total = envelope.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-9) {
    return 0;
  }
  const variance =
    envelope.reduce((sum, value, index) => {
      const frequency = (index / Math.max(1, envelope.length - 1)) * nyquist;
      const delta = frequency - centroid;
      return sum + value * delta * delta;
    }, 0) / total;
  return Math.sqrt(Math.max(0, variance));
}

function estimateRolloffFromEnvelope(envelope: number[], sampleRate?: number): number | null {
  if (envelope.length === 0 || !sampleRate) {
    return null;
  }
  const total = envelope.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-9) {
    return 0;
  }
  let cumulative = 0;
  for (let index = 0; index < envelope.length; index += 1) {
    cumulative += envelope[index] ?? 0;
    if (cumulative / total >= 0.85) {
      return (index / Math.max(1, envelope.length - 1)) * (sampleRate / 2);
    }
  }
  return sampleRate / 2;
}

function estimateBandwidthFromEnvelope(envelope: number[], sampleRate?: number): number | null {
  return estimateCentroidStdFromEnvelope(envelope, sampleRate);
}

function normalizeEnvelope(envelope: number[]): number[] {
  const min = Math.min(...envelope);
  const max = Math.max(...envelope);
  if (max - min <= 1e-9) {
    return envelope.map(() => 0.5);
  }
  return envelope.map((value) => clamp01((value - min) / (max - min)));
}

function createWaveformShapeHash(envelope: number[]): string | null {
  if (envelope.length === 0) {
    return null;
  }
  const step = Math.max(1, Math.floor(envelope.length / 32));
  const quantized = [];
  for (let index = 0; index < envelope.length; index += step) {
    quantized.push(Math.round(sanitize01(envelope[index] ?? 0) * 15).toString(16));
  }
  return createHash("sha1").update(quantized.join(""), "utf8").digest("hex").slice(0, 20);
}

function normalizeDuration(value: number | null): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 0;
  }
  return clamp01(Math.log10(value + 1) / Math.log10(600_000));
}

function normalizeRange(value: number | null, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) {
    return 0;
  }
  return clamp01(((value as number) - min) / (max - min));
}

function normalizeDb(value: number | null): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return clamp01(((value as number) + 80) / 80);
}

function sanitize01(value: number | null | undefined): number {
  return Number.isFinite(value) ? clamp01(value as number) : 0;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? (value as number) : null;
}

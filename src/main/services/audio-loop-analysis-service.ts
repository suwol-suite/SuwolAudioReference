import type { AudioAnalysisResult, WaveformBucket, WaveformSummary } from "../../shared/audio-analysis-types";
import type { LoopAnalysisDetails, LoopAnalysisReasonCode } from "../../shared/audio-feature-types";
import { estimateLoopLikelihood } from "./audio-analysis-service";
import { clamp, clamp01 } from "./waveform-service";

export function analyzeLoopFromSummary(analysis: AudioAnalysisResult | null | undefined): LoopAnalysisDetails {
  const summary = analysis?.waveformSummary;
  const durationMs = analysis?.durationMs ?? 0;
  const boundarySimilarity = calculateLoopBoundarySimilarity(summary);
  const clickRisk = calculateLoopClickRisk(summary);
  const fadeOutRisk = calculateFadeOutRisk(summary);
  const previousLoopScore = Number.isFinite(analysis?.loopScore) ? (analysis?.loopScore as number) : boundarySimilarity;
  const loopScore = clamp01(
    boundarySimilarity * 0.42 +
      (1 - clickRisk) * 0.22 +
      (1 - fadeOutRisk) * 0.2 +
      clamp01(previousLoopScore) * 0.16,
  );
  const reasons = createLoopReasons(boundarySimilarity, clickRisk, fadeOutRisk, durationMs);

  return {
    boundarySimilarity,
    clickRisk,
    fadeOutRisk,
    loopScore,
    label: estimateLoopLikelihood(loopScore),
    reasons,
  };
}

export function calculateLoopBoundarySimilarity(summary: WaveformSummary | null | undefined): number {
  const buckets = summary?.buckets ?? [];
  if (buckets.length < 4) {
    return 0;
  }

  const windowSize = getBoundaryWindowSize(buckets.length);
  const start = buckets.slice(0, windowSize);
  const end = buckets.slice(-windowSize);
  const startRms = average(start, "rms");
  const endRms = average(end, "rms");
  const startPeak = average(start, "peak");
  const endPeak = average(end, "peak");
  const energyMatch = 1 - clamp(Math.abs(startRms - endRms) / 0.35, 0, 1);
  const peakMatch = 1 - clamp(Math.abs(startPeak - endPeak) / 0.45, 0, 1);
  const shapeMatch = calculateCorrelation(
    start.map((bucket) => bucket.rms + bucket.peak * 0.5),
    end.map((bucket) => bucket.rms + bucket.peak * 0.5),
  );

  return clamp01(energyMatch * 0.4 + peakMatch * 0.25 + shapeMatch * 0.35);
}

export function calculateLoopClickRisk(summary: WaveformSummary | null | undefined): number {
  const buckets = summary?.buckets ?? [];
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  if (!first || !last) {
    return 1;
  }

  const firstCenter = (first.min + first.max) / 2;
  const lastCenter = (last.min + last.max) / 2;
  const centerJump = Math.abs(firstCenter - lastCenter);
  const edgePeakJump = Math.abs(first.peak - last.peak);
  return clamp01(centerJump / 0.45 * 0.65 + edgePeakJump / 0.65 * 0.35);
}

export function calculateFadeOutRisk(summary: WaveformSummary | null | undefined): number {
  const buckets = summary?.buckets ?? [];
  if (buckets.length < 6) {
    return 0.5;
  }

  const windowSize = getBoundaryWindowSize(buckets.length);
  const end = buckets.slice(-windowSize);
  const beforeEnd = buckets.slice(Math.max(0, buckets.length - windowSize * 2), buckets.length - windowSize);
  const endRms = average(end, "rms");
  const beforeEndRms = average(beforeEnd, "rms");
  if (beforeEndRms <= 0.0001) {
    return 0;
  }

  return clamp01((beforeEndRms - endRms) / Math.max(beforeEndRms, 0.0001));
}

function createLoopReasons(
  boundarySimilarity: number,
  clickRisk: number,
  fadeOutRisk: number,
  durationMs: number,
): LoopAnalysisReasonCode[] {
  const reasons: LoopAnalysisReasonCode[] = [];

  reasons.push(boundarySimilarity >= 0.68 ? "loop_boundary_match" : "loop_boundary_mismatch");
  reasons.push(clickRisk <= 0.32 ? "low_click_risk" : "high_click_risk");
  reasons.push(fadeOutRisk <= 0.28 ? "no_fade_out" : "fade_out_detected");

  if (boundarySimilarity >= 0.6 && fadeOutRisk <= 0.32) {
    reasons.push("stable_loop_energy");
  }
  if (durationMs > 0 && durationMs < 500) {
    reasons.push("short_loop_warning");
  }

  return reasons;
}

function getBoundaryWindowSize(bucketCount: number): number {
  return Math.max(2, Math.min(16, Math.round(bucketCount * 0.12)));
}

function average(buckets: WaveformBucket[], key: "rms" | "peak"): number {
  if (buckets.length === 0) {
    return 0;
  }
  return buckets.reduce((sum, bucket) => sum + Math.max(0, bucket[key]), 0) / buckets.length;
}

function calculateCorrelation(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  if (length <= 1) {
    return 0;
  }

  const leftMean = left.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  const rightMean = right.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < length; index += 1) {
    const leftDelta = (left[index] ?? 0) - leftMean;
    const rightDelta = (right[index] ?? 0) - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }

  if (leftVariance <= 1e-9 || rightVariance <= 1e-9) {
    return 1 - clamp(Math.abs(leftMean - rightMean) / 0.5, 0, 1);
  }

  return clamp01((numerator / Math.sqrt(leftVariance * rightVariance) + 1) / 2);
}

import type { AudioAnalysisMetrics, LoopLikelihood } from "../../shared/audio-analysis-types";
import {
  amplitudeToDb,
  calculatePeak,
  calculateRms,
  clamp,
  clamp01,
  createWaveformSummary,
  downmixToMono,
} from "./waveform-service";

export interface PcmAudioBuffer {
  channels: Float32Array[];
  sampleRate: number;
  bitrate?: number;
  codec?: string;
  format?: string;
}

export interface AnalyzeAudioOptions {
  waveformBuckets?: number;
  silenceThresholdDb?: number;
}

export interface SilenceDurations {
  silenceStartMs: number;
  silenceEndMs: number;
}

export function analyzePcmAudio(
  audioBuffer: PcmAudioBuffer,
  options: AnalyzeAudioOptions = {},
): AudioAnalysisMetrics {
  const sampleRate = audioBuffer.sampleRate;
  const mono = downmixToMono(audioBuffer.channels);
  const durationMs = sampleRate > 0 ? (mono.length / sampleRate) * 1000 : undefined;
  const peak = calculatePeak(mono);
  const rms = calculateRms(mono);
  const spectrum = calculateSpectralFeatures(mono, sampleRate);
  const silence = calculateSilenceDurations(mono, sampleRate, options.silenceThresholdDb);
  const loopScore = calculateLoopScore(audioBuffer);

  return {
    durationMs,
    sampleRate,
    channels: audioBuffer.channels.length,
    bitrate: audioBuffer.bitrate,
    codec: audioBuffer.codec,
    format: audioBuffer.format,
    waveformSummary: createWaveformSummary(audioBuffer.channels, sampleRate, options.waveformBuckets ?? 256),
    peakDb: amplitudeToDb(peak),
    rmsDb: amplitudeToDb(rms),
    loudnessDb: amplitudeToDb(rms),
    silenceStartMs: silence.silenceStartMs,
    silenceEndMs: silence.silenceEndMs,
    transientCount: countTransients(mono, sampleRate),
    zeroCrossingRate: calculateZeroCrossingRate(mono),
    spectralCentroid: spectrum.spectralCentroid,
    spectralFlatness: spectrum.spectralFlatness,
    rmsVariation: calculateRmsVariation(mono, sampleRate),
    loopScore,
  };
}

export function calculateSilenceDurations(
  samples: Float32Array,
  sampleRate: number,
  thresholdDb = -45,
  windowMs = 10,
): SilenceDurations {
  if (samples.length === 0 || sampleRate <= 0) {
    return { silenceStartMs: 0, silenceEndMs: 0 };
  }

  const thresholdAmplitude = 10 ** (thresholdDb / 20);
  const windowSize = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const durationMs = (samples.length / sampleRate) * 1000;
  let firstAudibleIndex = samples.length;
  let lastAudibleIndex = -1;

  for (let start = 0; start < samples.length; start += windowSize) {
    const end = Math.min(samples.length, start + windowSize);
    if (calculateRms(samples, start, end) >= thresholdAmplitude) {
      firstAudibleIndex = start;
      break;
    }
  }

  for (let end = samples.length; end > 0; end -= windowSize) {
    const start = Math.max(0, end - windowSize);
    if (calculateRms(samples, start, end) >= thresholdAmplitude) {
      lastAudibleIndex = end;
      break;
    }
  }

  if (firstAudibleIndex === samples.length || lastAudibleIndex < 0) {
    return { silenceStartMs: durationMs, silenceEndMs: durationMs };
  }

  return {
    silenceStartMs: clamp((firstAudibleIndex / sampleRate) * 1000, 0, durationMs),
    silenceEndMs: clamp(((samples.length - lastAudibleIndex) / sampleRate) * 1000, 0, durationMs),
  };
}

export function calculateZeroCrossingRate(samples: Float32Array): number {
  if (samples.length < 2) {
    return 0;
  }

  let crossings = 0;
  let previous = samples[0] ?? 0;

  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index] ?? 0;
    if ((previous >= 0 && current < 0) || (previous < 0 && current >= 0)) {
      crossings += 1;
    }
    previous = current;
  }

  return crossings / (samples.length - 1);
}

export function countTransients(samples: Float32Array, sampleRate: number): number {
  if (samples.length === 0 || sampleRate <= 0) {
    return 0;
  }

  const windowSize = Math.max(16, Math.round(sampleRate * 0.01));
  const refractoryWindows = Math.max(1, Math.round(0.03 / 0.01));
  let previousDb = -120;
  let transients = 0;
  let windowsSinceTransient = refractoryWindows;

  for (let start = 0; start < samples.length; start += windowSize) {
    const end = Math.min(samples.length, start + windowSize);
    const currentDb = amplitudeToDb(calculateRms(samples, start, end));
    const jumpDb = currentDb - previousDb;

    if (windowsSinceTransient >= refractoryWindows && currentDb > -48 && jumpDb > 8) {
      transients += 1;
      windowsSinceTransient = 0;
    } else {
      windowsSinceTransient += 1;
    }

    previousDb = Math.max(previousDb * 0.65 + currentDb * 0.35, -120);
  }

  return transients;
}

export function calculateRmsVariation(samples: Float32Array, sampleRate: number): number {
  if (samples.length === 0 || sampleRate <= 0) {
    return 0;
  }

  const windowSize = Math.max(128, Math.round(sampleRate * 0.1));
  const values: number[] = [];

  for (let start = 0; start < samples.length; start += windowSize) {
    values.push(calculateRms(samples, start, Math.min(samples.length, start + windowSize)));
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  if (mean <= 0) {
    return 0;
  }

  const variance =
    values.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) / Math.max(1, values.length);

  return clamp01(Math.sqrt(variance) / mean);
}

export function calculateSpectralFeatures(
  samples: Float32Array,
  sampleRate: number,
): { spectralCentroid?: number; spectralFlatness?: number } {
  if (samples.length < 32 || sampleRate <= 0) {
    return {};
  }

  const fftSize = Math.min(2048, 2 ** Math.floor(Math.log2(samples.length)));
  const start = Math.max(0, Math.floor((samples.length - fftSize) / 2));
  const magnitudes: number[] = [];

  for (let bin = 1; bin < fftSize / 2; bin += 1) {
    let real = 0;
    let imaginary = 0;

    for (let index = 0; index < fftSize; index += 1) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1));
      const sample = (samples[start + index] ?? 0) * window;
      const angle = (2 * Math.PI * bin * index) / fftSize;
      real += sample * Math.cos(angle);
      imaginary -= sample * Math.sin(angle);
    }

    magnitudes.push(Math.sqrt(real * real + imaginary * imaginary));
  }

  const magnitudeSum = magnitudes.reduce((sum, magnitude) => sum + magnitude, 0);
  if (magnitudeSum <= 1e-9) {
    return { spectralCentroid: 0, spectralFlatness: 0 };
  }

  let weightedFrequency = 0;
  let logMagnitudeSum = 0;
  for (let index = 0; index < magnitudes.length; index += 1) {
    const magnitude = magnitudes[index] + 1e-12;
    const frequency = ((index + 1) * sampleRate) / fftSize;
    weightedFrequency += frequency * magnitude;
    logMagnitudeSum += Math.log(magnitude);
  }

  const arithmeticMean = magnitudeSum / magnitudes.length;
  const geometricMean = Math.exp(logMagnitudeSum / magnitudes.length);

  return {
    spectralCentroid: weightedFrequency / magnitudeSum,
    spectralFlatness: clamp01(geometricMean / Math.max(arithmeticMean, 1e-12)),
  };
}

export function calculateLoopScore(audioBuffer: PcmAudioBuffer): number {
  const mono = downmixToMono(audioBuffer.channels);
  const sampleRate = audioBuffer.sampleRate;

  if (mono.length === 0 || sampleRate <= 0) {
    return 0;
  }

  const durationSeconds = mono.length / sampleRate;
  if (durationSeconds < 0.5) {
    return 0.1;
  }

  const windowSeconds = clamp(durationSeconds * 0.1, 0.25, 1);
  const windowSize = Math.max(1, Math.min(Math.floor(windowSeconds * sampleRate), Math.floor(mono.length / 3)));
  const startRmsDb = amplitudeToDb(calculateRms(mono, 0, windowSize));
  const endRmsDb = amplitudeToDb(calculateRms(mono, mono.length - windowSize, mono.length));
  const previousEndStart = Math.max(0, mono.length - windowSize * 2);
  const previousEndRmsDb = amplitudeToDb(calculateRms(mono, previousEndStart, mono.length - windowSize));

  const startSpectrum = calculateSpectralFeatures(mono.slice(0, windowSize), sampleRate);
  const endSpectrum = calculateSpectralFeatures(mono.slice(mono.length - windowSize), sampleRate);
  const rmsMatch = 1 - clamp(Math.abs(startRmsDb - endRmsDb) / 18, 0, 1);
  const centroidDiff = Math.abs((startSpectrum.spectralCentroid ?? 0) - (endSpectrum.spectralCentroid ?? 0));
  const centroidMatch = 1 - clamp(centroidDiff / 2500, 0, 1);
  const discontinuity = Math.abs((mono[0] ?? 0) - (mono[mono.length - 1] ?? 0));
  const continuity = 1 - clamp(discontinuity / 0.5, 0, 1);
  const fadeOutPenalty = clamp((previousEndRmsDb - endRmsDb - 6) / 18, 0, 1);

  return clamp01(rmsMatch * 0.35 + centroidMatch * 0.25 + continuity * 0.25 + (1 - fadeOutPenalty) * 0.15);
}

export function estimateLoopLikelihood(loopScore?: number): LoopLikelihood {
  if (loopScore === undefined || !Number.isFinite(loopScore)) {
    return "unknown";
  }

  if (loopScore >= 0.72) {
    return "high";
  }

  if (loopScore >= 0.42) {
    return "medium";
  }

  return "low";
}

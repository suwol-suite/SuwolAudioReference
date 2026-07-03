import type { WaveformBucket, WaveformSummary } from "../../shared/audio-analysis-types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function amplitudeToDb(amplitude: number): number {
  if (!Number.isFinite(amplitude) || amplitude <= 0) {
    return -120;
  }

  return Math.max(-120, 20 * Math.log10(amplitude));
}

export function calculatePeak(samples: Float32Array, start = 0, end = samples.length): number {
  let peak = 0;
  const safeStart = clamp(Math.floor(start), 0, samples.length);
  const safeEnd = clamp(Math.floor(end), safeStart, samples.length);

  for (let index = safeStart; index < safeEnd; index += 1) {
    const value = Math.abs(samples[index] ?? 0);
    if (value > peak) {
      peak = value;
    }
  }

  return peak;
}

export function calculateRms(samples: Float32Array, start = 0, end = samples.length): number {
  const safeStart = clamp(Math.floor(start), 0, samples.length);
  const safeEnd = clamp(Math.floor(end), safeStart, samples.length);
  const length = safeEnd - safeStart;

  if (length <= 0) {
    return 0;
  }

  let sumSquares = 0;
  for (let index = safeStart; index < safeEnd; index += 1) {
    const value = samples[index] ?? 0;
    sumSquares += value * value;
  }

  return Math.sqrt(sumSquares / length);
}

export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array();
  }

  const length = Math.min(...channels.map((channel) => channel.length));
  const mono = new Float32Array(length);

  for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
    const channel = channels[channelIndex];
    for (let sampleIndex = 0; sampleIndex < length; sampleIndex += 1) {
      mono[sampleIndex] += (channel[sampleIndex] ?? 0) / channels.length;
    }
  }

  return mono;
}

export function createWaveformSummary(
  channels: Float32Array[],
  sampleRate: number,
  targetBucketCount = 256,
): WaveformSummary {
  const mono = downmixToMono(channels);
  const bucketCount = Math.max(1, Math.min(targetBucketCount, mono.length || 1));
  const bucketSize = Math.max(1, Math.ceil((mono.length || 1) / bucketCount));
  const buckets: WaveformBucket[] = [];

  for (let start = 0; start < mono.length; start += bucketSize) {
    const end = Math.min(mono.length, start + bucketSize);
    let min = 0;
    let max = 0;
    let sumSquares = 0;

    for (let index = start; index < end; index += 1) {
      const value = mono[index] ?? 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
      sumSquares += value * value;
    }

    const length = Math.max(1, end - start);
    buckets.push({
      min,
      max,
      peak: Math.max(Math.abs(min), Math.abs(max)),
      rms: Math.sqrt(sumSquares / length),
    });
  }

  if (buckets.length === 0) {
    buckets.push({ min: 0, max: 0, peak: 0, rms: 0 });
  }

  return {
    sampleRate,
    channels: channels.length,
    bucketSize,
    buckets,
  };
}

import { describe, expect, it } from "vitest";
import {
  analyzePcmAudio,
  calculateLoopScore,
  calculateSilenceDurations,
} from "../audio-analysis-service";

describe("audio-analysis-service", () => {
  it("calculates silence at the start and end", () => {
    const sampleRate = 1000;
    const samples = new Float32Array(1000);
    for (let index = 100; index < 850; index += 1) {
      samples[index] = 0.4;
    }

    const result = calculateSilenceDurations(samples, sampleRate, -45, 10);

    expect(result.silenceStartMs).toBeGreaterThanOrEqual(90);
    expect(result.silenceStartMs).toBeLessThanOrEqual(110);
    expect(result.silenceEndMs).toBeGreaterThanOrEqual(140);
    expect(result.silenceEndMs).toBeLessThanOrEqual(160);
  });

  it("scores seamless repeated waveforms higher than faded waveforms", () => {
    const sampleRate = 1000;
    const looping = makeSine(sampleRate, 4000, 10, 0.4);
    const faded = makeSine(sampleRate, 4000, 10, 0.4).map((value, index) => {
      const fade = index > 3000 ? 1 - (index - 3000) / 1000 : 1;
      return value * fade;
    });

    const loopScore = calculateLoopScore({ channels: [looping], sampleRate });
    const fadeScore = calculateLoopScore({ channels: [new Float32Array(faded)], sampleRate });

    expect(loopScore).toBeGreaterThan(0.55);
    expect(fadeScore).toBeLessThan(loopScore);
  });

  it("extracts core DSP metrics from generated PCM", () => {
    const sampleRate = 1000;
    const samples = makeSine(sampleRate, 1000, 20, 0.5);
    const result = analyzePcmAudio({ channels: [samples], sampleRate, format: "wav", codec: "pcm_s16le" });

    expect(result.durationMs).toBe(1000);
    expect(result.sampleRate).toBe(sampleRate);
    expect(result.channels).toBe(1);
    expect(result.peakDb).toBeGreaterThan(-7);
    expect(result.rmsDb).toBeLessThan(result.peakDb ?? 0);
    expect(result.zeroCrossingRate).toBeGreaterThan(0);
    expect(result.spectralCentroid).toBeGreaterThan(0);
    expect(result.waveformSummary?.buckets.length).toBeGreaterThan(0);
  });
});

function makeSine(sampleRate: number, length: number, frequency: number, amplitude: number): Float32Array {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude;
  }
  return samples;
}

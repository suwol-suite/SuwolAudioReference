import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { analyzeAudioJob } from "../audio-analysis-job-queue";
import { decodeLocalPcmAudio } from "../audio-pcm-decoder-service";

describe("audio-analysis-job-queue", () => {
  it("keeps import analysis graceful when PCM decode fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "suwol-audio-analysis-"));
    const filePath = join(directory, "ui_click.mp3");
    await writeFile(filePath, Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]));
    const saveResult = vi.fn();

    const result = await analyzeAudioJob({
      assetId: "asset-1",
      filePath,
      decodePcm: async () => {
        throw new Error("decoder unavailable");
      },
      saveResult,
    });

    expect(result.assetId).toBe("asset-1");
    expect(result.result.warnings.some((warning) => warning.startsWith("pcm_decode_failed"))).toBe(true);
    expect(result.result.classification.map((candidate) => candidate.type)).toContain("ui_sound");
    expect(saveResult).toHaveBeenCalledTimes(1);
  });

  it("keeps corrupted wav analysis as a safe fallback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "suwol-audio-corrupted-"));
    const filePath = join(directory, "broken_click.wav");
    await writeFile(filePath, Buffer.from("not a wav file", "utf8"));

    const result = await analyzeAudioJob({
      assetId: "asset-corrupted",
      filePath,
      decodePcm: decodeLocalPcmAudio,
    });

    expect(result.assetId).toBe("asset-corrupted");
    expect(result.result.format).toBe("wav");
    expect(result.result.warnings.some((warning) => warning.startsWith("pcm_decode_failed"))).toBe(true);
    expect(result.result.classification.length).toBeGreaterThan(0);
  });
});

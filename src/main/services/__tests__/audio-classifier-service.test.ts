import { describe, expect, it } from "vitest";
import { classifyAudio, createAudioAnalysisResult } from "../audio-classifier-service";

describe("audio-classifier-service", () => {
  it("classifies UI click sounds from filename, duration, and transient features", () => {
    const result = classifyAudio({
      metadata: {
        fileName: "ui_button_click.wav",
        folderName: "buttons",
        extension: "wav",
      },
      metrics: {
        durationMs: 280,
        channels: 1,
        transientCount: 1,
        silenceStartMs: 0,
        silenceEndMs: 0,
        spectralCentroid: 2600,
      },
    });

    expect(result.classification[0]?.type).toBe("ui_sound");
    expect(result.suggestedTags.map((tag) => tag.tag)).toEqual(
      expect.arrayContaining(["UI사운드", "클릭", "버튼", "짧음"]),
    );
  });

  it("combines music and loop candidates without turning suggestions into real tags", () => {
    const result = createAudioAnalysisResult({
      metadata: {
        fileName: "battle_theme_loop.ogg",
        folderName: "stage01",
        extension: "ogg",
      },
      metrics: {
        durationMs: 62000,
        channels: 2,
        rmsVariation: 0.18,
        transientCount: 40,
        loopScore: 0.86,
      },
    });

    expect(result.classification.map((candidate) => candidate.type)).toEqual(
      expect.arrayContaining(["music", "loop_candidate"]),
    );
    expect(result.loopLikelihood).toBe("high");
    expect(result.suggestedTags.map((tag) => tag.tag)).toEqual(expect.arrayContaining(["BGM", "루프가능", "긴음"]));
    expect(result.analyzerVersion).toBe("local-dsp-rules-v1");
  });

  it("sorts confidence from highest to lowest", () => {
    const result = classifyAudio({
      metadata: {
        fileName: "voice_dialog_npc.wav",
        folderName: "npc",
        extension: "wav",
      },
      metrics: {
        durationMs: 8000,
        channels: 1,
        spectralCentroid: 1200,
      },
    });

    const confidences = result.classification.map((candidate) => candidate.confidence);
    expect(confidences).toEqual([...confidences].sort((left, right) => right - left));
  });

  it("returns unknown when rules do not have enough evidence", () => {
    const result = classifyAudio({
      metadata: {
        fileName: "asset.bin",
        folderName: "misc",
        extension: "bin",
      },
    });

    expect(result.classification).toEqual([
      {
        type: "unknown",
        confidence: 0.5,
        reasons: ["insufficient_evidence"],
      },
    ]);
  });
});

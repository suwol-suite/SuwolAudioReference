import { describe, expect, it } from "vitest";
import type { AssetListItem } from "../../shared/library-types";
import { calculateLoudnessMatchGain } from "../audio-playback";

describe("audio-playback", () => {
  it("clamps loudness match gain and respects peak headroom", () => {
    const quiet = createAsset("quiet", -30, -2);
    const reference = createAsset("reference", -18, -1);

    const result = calculateLoudnessMatchGain(quiet, reference, true);

    expect(result.gainDb).toBe(2);
    expect(result.limitedByPeak).toBe(true);
  });

  it("returns unity gain when disabled or analysis is missing", () => {
    expect(calculateLoudnessMatchGain(createAsset("a", -20, -1), createAsset("b", -14, -1), false).gainLinear).toBe(1);
    expect(calculateLoudnessMatchGain(null, createAsset("b", -14, -1), true).gainLinear).toBe(1);
  });
});

function createAsset(id: string, rmsDb: number, peakDb: number): AssetListItem {
  return {
    id,
    libraryId: "library",
    originalPath: `${id}.wav`,
    storedPath: `${id}.wav`,
    fileName: `${id}.wav`,
    fileExt: "wav",
    fileSize: 44,
    contentHash: id,
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
    playable: true,
    playbackSupportReason: null,
    duplicateCount: 1,
    tags: [],
    collections: [],
    audioAnalysis: {
      rmsDb,
      peakDb,
      classification: [],
      suggestedTags: [],
      loopLikelihood: "unknown",
      analyzerVersion: "test",
      warnings: [],
    },
  };
}

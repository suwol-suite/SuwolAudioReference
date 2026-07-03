import { describe, expect, it } from "vitest";
import type { AssetListItem } from "../../shared/library-types";
import {
  DEFAULT_ASSET_FILTERS,
  filterAssets,
  getActiveFilterCount,
  getNextSelectionIndex,
  isQuickPreviewEligible,
  toAssetListQuery,
} from "../asset-filter";

describe("asset-filter", () => {
  it("filters by text, tags, favorite, trash, and analysis candidates", () => {
    const assets = [
      createAsset({
        id: "a",
        fileName: "ui_click.wav",
        favorite: true,
        tagName: "UI사운드",
        classificationType: "ui_sound",
      }),
      createAsset({
        id: "b",
        fileName: "forest_loop.wav",
        tagName: "앰비언스",
        classificationType: "ambience",
        trashedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];

    expect(filterAssets(assets, { ...DEFAULT_ASSET_FILTERS, search: "click" }).map((asset) => asset.id)).toEqual(["a"]);
    expect(filterAssets(assets, { ...DEFAULT_ASSET_FILTERS, favoriteOnly: true }).map((asset) => asset.id)).toEqual(["a"]);
    expect(filterAssets(assets, { ...DEFAULT_ASSET_FILTERS, tagIds: ["tag-ui"] }).map((asset) => asset.id)).toEqual(["a"]);
    expect(
      filterAssets(assets, { ...DEFAULT_ASSET_FILTERS, classificationTypes: ["ui_sound"] }).map((asset) => asset.id),
    ).toEqual(["a"]);
    expect(filterAssets(assets, { ...DEFAULT_ASSET_FILTERS, onlyTrashed: true }).map((asset) => asset.id)).toEqual(["b"]);
  });

  it("maps renderer filters to enhanced asset list queries", () => {
    const query = toAssetListQuery(
      {
        ...DEFAULT_ASSET_FILTERS,
        search: "click",
        smartFolder: "loopCandidates",
        minRating: 3,
        unplayableOnly: true,
      },
      "loopScoreDesc",
    );

    expect(query).toMatchObject({
      search: "click",
      smartFolder: "loopCandidates",
      minRating: 3,
      playable: false,
      sort: "loopScoreDesc",
      page: 1,
      pageSize: 250,
    });
  });

  it("serializes pagination and counts active filters predictably", () => {
    const filters = {
      ...DEFAULT_ASSET_FILTERS,
      search: "ui",
      tagIds: ["tag-ui"],
      loopHigh: true,
    };
    expect(toAssetListQuery(filters, "fileNameAsc", 3, 150)).toMatchObject({ page: 3, pageSize: 150 });
    expect(getActiveFilterCount(filters)).toBe(3);
  });

  it("moves selection without overflowing list bounds", () => {
    expect(getNextSelectionIndex(-1, 10, 1)).toBe(0);
    expect(getNextSelectionIndex(0, 10, -1)).toBe(0);
    expect(getNextSelectionIndex(9, 10, 1)).toBe(9);
    expect(getNextSelectionIndex(4, 10, 2)).toBe(6);
    expect(getNextSelectionIndex(0, 0, 1)).toBe(-1);
  });

  it("allows quick preview only for enabled short UI/SFX candidates", () => {
    const settings = {
      locale: "en" as const,
      theme: "dark" as const,
      quickPreviewEnabled: true,
      quickPreviewMaxDurationMs: 3000,
      quickPreviewAutoPlayShortSounds: true,
      stopPreviousOnSelectionChange: true,
    };

    expect(isQuickPreviewEligible(createAsset({ id: "a", fileName: "ui.wav", tagName: "UI", classificationType: "ui_sound", durationMs: 4000 }), settings)).toBe(true);
    expect(isQuickPreviewEligible(createAsset({ id: "b", fileName: "music.wav", tagName: "BGM", classificationType: "music", durationMs: 1000 }), settings)).toBe(false);
    expect(isQuickPreviewEligible(createAsset({ id: "c", fileName: "click.wav", tagName: "SFX", classificationType: "sfx", durationMs: 800 }), { ...settings, quickPreviewEnabled: false })).toBe(false);
  });

  it("filters Phase 5B feature and loop smart folders", () => {
    const ready = createAsset({
      id: "ready",
      fileName: "ready.wav",
      tagName: "UI",
      classificationType: "ui_sound",
      durationMs: 1000,
      featureVersion: "local-dsp-features-v1",
      loopBoundarySimilarity: 0.8,
      silenceStartMs: 150,
      peakDb: -2,
    });
    const missing = createAsset({
      id: "missing",
      fileName: "missing.wav",
      tagName: "SFX",
      classificationType: "sfx",
      durationMs: 1000,
      featureVersion: null,
    });
    const outdated = createAsset({
      id: "outdated",
      fileName: "old.wav",
      tagName: "SFX",
      classificationType: "sfx",
      durationMs: 1000,
      featureVersion: "old",
    });

    expect(filterAssets([ready, missing], { ...DEFAULT_ASSET_FILTERS, smartFolder: "similarCandidates" }).map((asset) => asset.id)).toEqual(["ready"]);
    expect(filterAssets([ready, missing], { ...DEFAULT_ASSET_FILTERS, smartFolder: "featureMissing" }).map((asset) => asset.id)).toEqual(["missing"]);
    expect(filterAssets([ready, outdated], { ...DEFAULT_ASSET_FILTERS, smartFolder: "needsReanalysis" }).map((asset) => asset.id)).toEqual(["outdated"]);
    expect(filterAssets([ready], { ...DEFAULT_ASSET_FILTERS, smartFolder: "highLoopCandidates" }).map((asset) => asset.id)).toEqual(["ready"]);
    expect(filterAssets([ready], { ...DEFAULT_ASSET_FILTERS, smartFolder: "silenceStart" }).map((asset) => asset.id)).toEqual(["ready"]);
    expect(filterAssets([ready], { ...DEFAULT_ASSET_FILTERS, smartFolder: "highPeak" }).map((asset) => asset.id)).toEqual(["ready"]);
  });
});

function createAsset(input: {
  id: string;
  fileName: string;
  tagName: string;
  classificationType: "ui_sound" | "ambience" | "sfx" | "music";
  durationMs?: number;
  featureVersion?: string | null;
  loopBoundarySimilarity?: number;
  silenceStartMs?: number;
  peakDb?: number;
  favorite?: boolean;
  trashedAt?: string | null;
}): AssetListItem {
  const tagId = input.tagName === "UI사운드" ? "tag-ui" : "tag-ambience";
  return {
    id: input.id,
    libraryId: "library",
    originalPath: input.fileName,
    storedPath: input.fileName,
    fileName: input.fileName,
    fileExt: "wav",
    fileSize: 44,
    contentHash: input.id,
    importMode: "copy",
    mediaType: "audio",
    title: null,
    memo: "",
    rating: 0,
    favorite: input.favorite ?? false,
    trashedAt: input.trashedAt ?? null,
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
    tags: [
      {
        id: tagId,
        libraryId: "library",
        name: input.tagName,
        color: "#55c7a5",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    collections: [],
    audioAnalysis: {
      durationMs: input.durationMs,
      silenceStartMs: input.silenceStartMs,
      peakDb: input.peakDb,
      classification: [{ type: input.classificationType, confidence: 0.8, reasons: [] }],
      suggestedTags: [],
      loopLikelihood: "low",
      analyzerVersion: "test",
      warnings: [],
    },
    audioFeatures:
      input.featureVersion === undefined || input.featureVersion === null
        ? null
        : {
            assetId: input.id,
            analyzerVersion: input.featureVersion,
            durationMs: input.durationMs ?? null,
            dynamicRangeDb: null,
            attackTimeMs: null,
            decayTimeMs: null,
            spectralCentroidMean: null,
            spectralCentroidStd: null,
            spectralFlatness: null,
            spectralRolloffHz: null,
            spectralBandwidthHz: null,
            lowBandRatio: null,
            midBandRatio: null,
            highBandRatio: null,
            transientDensity: null,
            rhythmicRepetitionScore: null,
            loopBoundarySimilarity: input.loopBoundarySimilarity ?? null,
            loopClickRisk: null,
            loopFadeOutRisk: null,
            waveformShapeHash: null,
            featureVector: [],
            loopReasons: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
  };
}

import type { AppSettings } from "../shared/settings-types";
import type { AssetListItem, AssetListQuery, AssetSortOption, SmartFolderId } from "../shared/library-types";
import { AUDIO_FEATURE_ANALYZER_VERSION } from "../shared/audio-feature-types";

export interface RendererAssetFilters {
  search: string;
  smartFolder: SmartFolderId;
  onlyTrashed: boolean;
  favoriteOnly: boolean;
  minRating: number;
  tagIds: string[];
  collectionIds: string[];
  classificationTypes: string[];
  loopHigh: boolean;
  shortOnly: boolean;
  longOnly: boolean;
  playableOnly: boolean;
  unplayableOnly: boolean;
}

export const DEFAULT_ASSET_FILTERS: RendererAssetFilters = {
  search: "",
  smartFolder: "all",
  onlyTrashed: false,
  favoriteOnly: false,
  minRating: 0,
  tagIds: [],
  collectionIds: [],
  classificationTypes: [],
  loopHigh: false,
  shortOnly: false,
  longOnly: false,
  playableOnly: false,
  unplayableOnly: false,
};

export function toAssetListQuery(
  filters: RendererAssetFilters,
  sort: AssetSortOption,
  page = 1,
  pageSize = 250,
): AssetListQuery {
  const smartFolder = filters.onlyTrashed ? "trash" : filters.smartFolder;
  return {
    search: filters.search,
    smartFolder,
    onlyTrashed: smartFolder === "trash",
    favorite: filters.favoriteOnly ? true : undefined,
    minRating: filters.minRating > 0 ? filters.minRating : undefined,
    tagIds: filters.tagIds,
    collectionIds: filters.collectionIds,
    classificationTypes: filters.classificationTypes,
    loopHigh: filters.loopHigh,
    durationUnderMs: filters.shortOnly ? 1000 : undefined,
    durationOverMs: filters.longOnly ? 30000 : undefined,
    playable: filters.playableOnly ? true : filters.unplayableOnly ? false : undefined,
    sort,
    page,
    pageSize,
  };
}

export function getActiveFilterCount(filters: RendererAssetFilters): number {
  return [
    filters.search.trim(),
    filters.smartFolder !== "all" && !filters.onlyTrashed,
    filters.onlyTrashed,
    filters.favoriteOnly,
    filters.minRating > 0,
    filters.tagIds.length > 0,
    filters.collectionIds.length > 0,
    filters.classificationTypes.length > 0,
    filters.loopHigh,
    filters.shortOnly,
    filters.longOnly,
    filters.playableOnly,
    filters.unplayableOnly,
  ].filter(Boolean).length;
}

export function getNextSelectionIndex(currentIndex: number, length: number, offset: number): number {
  if (length <= 0) {
    return -1;
  }
  if (currentIndex < 0) {
    return offset >= 0 ? 0 : length - 1;
  }
  return Math.max(0, Math.min(length - 1, currentIndex + offset));
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") {
    return false;
  }
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable;
}

export function isQuickPreviewEligible(asset: AssetListItem | null, settings: AppSettings | null): boolean {
  if (!asset || !settings?.quickPreviewEnabled || !settings.quickPreviewAutoPlayShortSounds || !asset.playable) {
    return false;
  }
  if (asset.audioAnalysis?.classification.some((candidate) => candidate.type === "music" || candidate.type === "ambience" || candidate.type === "voice")) {
    return false;
  }
  const durationMs = asset.audioAnalysis?.durationMs;
  if (durationMs !== undefined && durationMs <= settings.quickPreviewMaxDurationMs) {
    return true;
  }
  return Boolean(asset.audioAnalysis?.classification.some((candidate) => candidate.type === "ui_sound" || candidate.type === "sfx"));
}

export function filterAssets(assets: AssetListItem[], filters: RendererAssetFilters): AssetListItem[] {
  const search = filters.search.trim().toLocaleLowerCase("ko-KR");

  return assets.filter((asset) => {
    if (filters.smartFolder !== "all" && !matchesRendererSmartFolder(asset, filters.smartFolder)) {
      return false;
    }

    if (filters.onlyTrashed) {
      if (!asset.trashedAt) {
        return false;
      }
    } else if (asset.trashedAt) {
      return false;
    }

    if (filters.favoriteOnly && !asset.favorite) {
      return false;
    }

    if (filters.minRating > 0 && asset.rating < filters.minRating) {
      return false;
    }

    if (filters.tagIds.length > 0 && !filters.tagIds.every((id) => asset.tags.some((tag) => tag.id === id))) {
      return false;
    }

    if (
      filters.collectionIds.length > 0 &&
      !filters.collectionIds.every((id) => asset.collections.some((collection) => collection.id === id))
    ) {
      return false;
    }

    if (
      filters.classificationTypes.length > 0 &&
      !asset.audioAnalysis?.classification.some((candidate) => filters.classificationTypes.includes(candidate.type))
    ) {
      return false;
    }

    if (filters.loopHigh && asset.audioAnalysis?.loopLikelihood !== "high" && (asset.audioAnalysis?.loopScore ?? 0) < 0.72) {
      return false;
    }

    if (filters.shortOnly && (asset.audioAnalysis?.durationMs ?? Number.POSITIVE_INFINITY) > 1000) {
      return false;
    }

    if (filters.longOnly && (asset.audioAnalysis?.durationMs ?? 0) < 30000) {
      return false;
    }

    if (filters.playableOnly && !asset.playable) {
      return false;
    }

    if (filters.unplayableOnly && asset.playable) {
      return false;
    }

    if (!search) {
      return true;
    }

    return createSearchText(asset).includes(search);
  });
}

function matchesRendererSmartFolder(asset: AssetListItem, smartFolder: SmartFolderId): boolean {
  switch (smartFolder) {
    case "favorites":
      return asset.favorite;
    case "recentPlayed":
      return Boolean(asset.lastPlayedAt);
    case "shortSounds":
      return (asset.audioAnalysis?.durationMs ?? Number.POSITIVE_INFINITY) <= 3000 || hasClassification(asset, "ui_sound") || hasClassification(asset, "sfx");
    case "longBeds":
      return (asset.audioAnalysis?.durationMs ?? 0) >= 30000 || hasClassification(asset, "music") || hasClassification(asset, "ambience");
    case "uiCandidates":
      return hasClassification(asset, "ui_sound");
    case "sfxCandidates":
      return hasClassification(asset, "sfx");
    case "musicCandidates":
      return hasClassification(asset, "music");
    case "voiceCandidates":
      return hasClassification(asset, "voice");
    case "ambienceCandidates":
      return hasClassification(asset, "ambience");
    case "loopCandidates":
      return asset.audioAnalysis?.loopLikelihood === "high" || (asset.audioAnalysis?.loopScore ?? 0) >= 0.72 || hasClassification(asset, "loop_candidate");
    case "similarCandidates":
      return Boolean(asset.audioFeatures);
    case "highLoopCandidates":
      return (asset.audioFeatures?.loopBoundarySimilarity ?? 0) >= 0.72 || (asset.audioAnalysis?.loopScore ?? 0) >= 0.72;
    case "silenceStart":
      return (asset.audioAnalysis?.silenceStartMs ?? 0) >= 120;
    case "silenceEnd":
      return (asset.audioAnalysis?.silenceEndMs ?? 0) >= 120;
    case "highPeak":
      return (asset.audioAnalysis?.peakDb ?? -120) >= -3;
    case "highRms":
      return (asset.audioAnalysis?.rmsDb ?? -120) >= -14;
    case "featureMissing":
      return asset.mediaType === "audio" && !asset.audioFeatures;
    case "needsReanalysis":
      return asset.mediaType === "audio" && asset.audioFeatures?.analyzerVersion !== AUDIO_FEATURE_ANALYZER_VERSION;
    case "retro8BitCandidates":
      return hasClassification(asset, "retro_8bit_candidate");
    case "retro16BitCandidates":
      return hasClassification(asset, "retro_16bit_candidate");
    case "analysisFailed":
      return asset.mediaType === "audio" && !asset.audioAnalysis;
    case "unplayable":
      return !asset.playable;
    case "duplicateCandidates":
      return asset.duplicateCount > 1;
    case "trash":
      return Boolean(asset.trashedAt);
    case "recentImports":
    case "all":
    default:
      return true;
  }
}

function hasClassification(asset: AssetListItem, type: string): boolean {
  return Boolean(asset.audioAnalysis?.classification.some((candidate) => candidate.type === type));
}

function createSearchText(asset: AssetListItem): string {
  return [
    asset.fileName,
    asset.title ?? "",
    asset.memo,
    asset.fileExt,
    ...asset.tags.map((tag) => tag.name),
    ...asset.collections.map((collection) => collection.name),
    ...(asset.audioAnalysis?.classification.map((candidate) => candidate.type) ?? []),
    asset.audioAnalysis?.format ?? "",
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR");
}

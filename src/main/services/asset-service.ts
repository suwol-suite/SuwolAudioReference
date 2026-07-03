import { extname } from "node:path";
import type {
  AssetListPage,
  AssetListItem,
  AssetListQuery,
  AssetRecord,
  AssetSortOption,
  AssetUpdateInput,
  CollectionRecord,
  PlaybackSupportUpdateInput,
  SmartFolderId,
  TagRecord,
} from "../../shared/library-types";
import type {
  AudioAnalysisResult,
  AudioClassificationCandidate,
  SuggestedAudioTag,
  WaveformSummary,
} from "../../shared/audio-analysis-types";
import {
  AUDIO_FEATURE_ANALYZER_VERSION,
  type AssetAudioFeatureRecord,
} from "../../shared/audio-feature-types";
import type { LibraryService } from "./library-service";
import { mapCollectionRow, mapTagRow } from "./library-service";
import { isPlayableAudio, playbackSupportReason } from "../../shared/playback-support";
import { type AssetAudioFeatureRow, mapAssetAudioFeatureRow } from "./audio-feature-repository";

interface AssetRow {
  id: string;
  library_id: string;
  original_path: string;
  stored_path: string | null;
  file_name: string;
  file_ext: string;
  file_size: number;
  content_hash: string;
  import_mode: "copy" | "link";
  media_type: "audio" | "midi" | "data" | "archive";
  title: string | null;
  memo: string;
  rating: number;
  favorite: number;
  trashed_at: string | null;
  last_played_at: string | null;
  play_count: number;
  playback_supported: number | null;
  playback_error_code: string | null;
  file_missing: number;
  file_missing_checked_at: string | null;
  relinked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AssetAudioAnalysisRow {
  asset_id: string;
  duration_ms: number | null;
  sample_rate: number | null;
  channels: number | null;
  bitrate: number | null;
  codec: string | null;
  format: string | null;
  peak_db: number | null;
  rms_db: number | null;
  loudness_db: number | null;
  silence_start_ms: number | null;
  silence_end_ms: number | null;
  transient_count: number | null;
  zero_crossing_rate: number | null;
  spectral_centroid: number | null;
  spectral_flatness: number | null;
  loop_score: number | null;
  classification_json: string;
  suggested_tags_json: string;
  waveform_summary_json: string | null;
  analyzer_version: string;
  ignored_at: string | null;
}

interface TagRow {
  id: string;
  library_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

interface CollectionRow {
  id: string;
  library_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export class AssetService {
  private readonly lastPlayRecordedAt = new Map<string, number>();

  constructor(private readonly libraryService: LibraryService) {}

  async listAssets(query: AssetListQuery = {}): Promise<AssetListItem[]> {
    return this.listAssetPage(query).then((page) => page.items);
  }

  async listAssetPage(query: AssetListQuery = {}): Promise<AssetListPage> {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<AssetRow>(
      "SELECT * FROM assets WHERE library_id = ? ORDER BY created_at DESC",
      [context.library.id],
    );
    const duplicateCounts = createDuplicateCountMap(rows);
    const hydrated = rows.map((row) => this.hydrateAsset(row, duplicateCounts));
    const filtered = hydrated.filter((asset) => matchesAssetQuery(asset, query));
    const sorted = sortAssets(filtered, query.sort ?? inferSmartFolderSort(query.smartFolder));
    const pageSize = Math.max(1, Math.min(query.pageSize ?? query.limit ?? 500, 1000));
    const page = Math.max(1, query.page ?? Math.floor(Math.max(0, query.offset ?? 0) / pageSize) + 1);
    const offset = query.offset ?? (page - 1) * pageSize;
    return {
      items: sorted.slice(offset, offset + pageSize),
      total: sorted.length,
      page,
      pageSize,
    };
  }

  async getAsset(assetId: string): Promise<AssetListItem | null> {
    const context = this.libraryService.requireActive();
    const row = context.db.get<AssetRow>("SELECT * FROM assets WHERE id = ? AND library_id = ?", [
      assetId,
      context.library.id,
    ]);
    return row ? this.hydrateAsset(row) : null;
  }

  async updateAsset(assetId: string, input: AssetUpdateInput): Promise<AssetListItem> {
    const context = this.libraryService.requireActive();
    const current = await this.getAsset(assetId);
    if (!current) {
      throw new Error("asset을 찾을 수 없습니다.");
    }

    const nextTitle = input.title === undefined ? current.title : input.title;
    const nextMemo = input.memo === undefined ? current.memo : input.memo;
    const nextRating = input.rating === undefined ? current.rating : clampRating(input.rating);
    const nextFavorite = input.favorite === undefined ? current.favorite : input.favorite;

    context.db.run(
      `
      UPDATE assets
      SET title = ?, memo = ?, rating = ?, favorite = ?, updated_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [nextTitle, nextMemo, nextRating, nextFavorite ? 1 : 0, new Date().toISOString(), assetId, context.library.id],
    );

    const updated = await this.getAsset(assetId);
    if (!updated) {
      throw new Error("asset 업데이트 결과를 읽을 수 없습니다.");
    }
    return updated;
  }

  async recordPlayed(assetId: string, now = new Date()): Promise<AssetListItem | null> {
    const context = this.libraryService.requireActive();
    const current = await this.getAsset(assetId);
    if (!current || !current.playable) {
      return current;
    }

    const nowMs = now.getTime();
    const previousMs = this.lastPlayRecordedAt.get(assetId) ?? 0;
    if (nowMs - previousMs < 2000) {
      return current;
    }

    this.lastPlayRecordedAt.set(assetId, nowMs);
    context.db.run(
      `
      UPDATE assets
      SET play_count = play_count + 1, last_played_at = ?, updated_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [now.toISOString(), now.toISOString(), assetId, context.library.id],
    );
    return this.getAsset(assetId);
  }

  async updatePlaybackSupportState(assetId: string, input: PlaybackSupportUpdateInput): Promise<AssetListItem | null> {
    const context = this.libraryService.requireActive();
    const current = await this.getAsset(assetId);
    if (!current) {
      return null;
    }

    context.db.run(
      `
      UPDATE assets
      SET playback_supported = ?, playback_error_code = ?, updated_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [
        input.supported ? 1 : 0,
        input.supported ? null : input.errorCode ?? "CODEC_UNSUPPORTED",
        new Date().toISOString(),
        assetId,
        context.library.id,
      ],
    );

    return this.getAsset(assetId);
  }

  async getAnalysis(assetId: string): Promise<AudioAnalysisResult | null> {
    const context = this.libraryService.requireActive();
    const row = context.db.get<AssetAudioAnalysisRow>("SELECT * FROM asset_audio_analysis WHERE asset_id = ?", [
      assetId,
    ]);
    return row ? mapAnalysisRow(row) : null;
  }

  getAssetFilePath(asset: AssetRecord): string {
    return asset.importMode === "copy" && asset.storedPath ? asset.storedPath : asset.originalPath;
  }

  deleteAssetRecord(assetId: string): void {
    const context = this.libraryService.requireActive();
    context.db.run("DELETE FROM assets WHERE id = ? AND library_id = ?", [assetId, context.library.id]);
  }

  hydrateAsset(row: AssetRow, duplicateCounts?: Map<string, number>): AssetListItem {
    const context = this.libraryService.requireActive();
    const asset = mapAssetRow(row);
    const tags = context.db.all<TagRow>(
      `
      SELECT t.*
      FROM tags t
      JOIN asset_tags at ON at.tag_id = t.id
      WHERE at.asset_id = ?
      ORDER BY t.name COLLATE NOCASE
      `,
      [asset.id],
    ).map(mapTagRow);
    const collections = context.db.all<CollectionRow>(
      `
      SELECT c.*
      FROM collections c
      JOIN collection_assets ca ON ca.collection_id = c.id
      WHERE ca.asset_id = ?
      ORDER BY c.name COLLATE NOCASE
      `,
      [asset.id],
    ).map(mapCollectionRow);
    const analysis = context.db.get<AssetAudioAnalysisRow>("SELECT * FROM asset_audio_analysis WHERE asset_id = ?", [
      asset.id,
    ]);
    const feature = context.db.get<AssetAudioFeatureRow>("SELECT * FROM asset_audio_features WHERE asset_id = ?", [
      asset.id,
    ]);

    const mapped = {
      ...asset,
      tags,
      collections,
      audioAnalysis: analysis ? mapAnalysisRow(analysis) : null,
      audioFeatures: feature ? mapAssetAudioFeatureRow(feature) : null,
      playable: isPlayableAudio(asset.fileExt, asset.playbackSupported),
      playbackSupportReason: playbackSupportReason(asset),
      duplicateCount: duplicateCounts?.get(asset.contentHash) ?? 1,
    };
    return mapped;
  }
}

export function mapAssetRow(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    originalPath: row.original_path,
    storedPath: row.stored_path,
    fileName: row.file_name,
    fileExt: row.file_ext,
    fileSize: row.file_size,
    contentHash: row.content_hash,
    importMode: row.import_mode,
    mediaType: row.media_type,
    title: row.title,
    memo: row.memo,
    rating: row.rating,
    favorite: row.favorite === 1,
    trashedAt: row.trashed_at,
    lastPlayedAt: row.last_played_at,
    playCount: row.play_count,
    playbackSupported: row.playback_supported === null ? null : row.playback_supported === 1,
    playbackErrorCode: row.playback_error_code as AssetRecord["playbackErrorCode"],
    fileMissing: row.file_missing === 1,
    fileMissingCheckedAt: row.file_missing_checked_at,
    relinkedAt: row.relinked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAnalysisRow(row: AssetAudioAnalysisRow): AudioAnalysisResult {
  return {
    durationMs: numberOrUndefined(row.duration_ms),
    sampleRate: numberOrUndefined(row.sample_rate),
    channels: numberOrUndefined(row.channels),
    bitrate: numberOrUndefined(row.bitrate),
    codec: row.codec ?? undefined,
    format: row.format ?? undefined,
    peakDb: numberOrUndefined(row.peak_db),
    rmsDb: numberOrUndefined(row.rms_db),
    loudnessDb: numberOrUndefined(row.loudness_db),
    silenceStartMs: numberOrUndefined(row.silence_start_ms),
    silenceEndMs: numberOrUndefined(row.silence_end_ms),
    transientCount: numberOrUndefined(row.transient_count),
    zeroCrossingRate: numberOrUndefined(row.zero_crossing_rate),
    spectralCentroid: numberOrUndefined(row.spectral_centroid),
    spectralFlatness: numberOrUndefined(row.spectral_flatness),
    loopScore: numberOrUndefined(row.loop_score),
    waveformSummary: parseJson<WaveformSummary>(row.waveform_summary_json),
    classification: parseJson<AudioClassificationCandidate[]>(row.classification_json) ?? [],
    suggestedTags: parseJson<SuggestedAudioTag[]>(row.suggested_tags_json) ?? [],
    loopLikelihood: inferLoopLikelihood(row.loop_score),
    analyzerVersion: row.analyzer_version,
    warnings: [],
  };
}

export function getExtension(filePath: string): string {
  return extname(filePath).replace(/^\./, "").toLowerCase();
}

function matchesAssetQuery(asset: AssetListItem, query: AssetListQuery): boolean {
  if (query.smartFolder && !matchesSmartFolder(asset, query.smartFolder)) {
    return false;
  }

  if (query.onlyTrashed) {
    if (!asset.trashedAt) {
      return false;
    }
  } else if (!query.includeTrashed && asset.trashedAt) {
    return false;
  }

  if (query.favorite !== undefined && asset.favorite !== query.favorite) {
    return false;
  }

  if (query.minRating !== undefined && asset.rating < query.minRating) {
    return false;
  }

  if (query.tagIds?.length && !query.tagIds.every((tagId) => asset.tags.some((tag) => tag.id === tagId))) {
    return false;
  }

  if (
    query.collectionIds?.length &&
    !query.collectionIds.every((collectionId) => asset.collections.some((collection) => collection.id === collectionId))
  ) {
    return false;
  }

  if (
    query.classificationTypes?.length &&
    !asset.audioAnalysis?.classification.some((candidate) => query.classificationTypes?.includes(candidate.type))
  ) {
    return false;
  }

  if (query.loopHigh && asset.audioAnalysis?.loopLikelihood !== "high" && (asset.audioAnalysis?.loopScore ?? 0) < 0.72) {
    return false;
  }

  if (query.durationUnderMs !== undefined && (asset.audioAnalysis?.durationMs ?? Number.POSITIVE_INFINITY) > query.durationUnderMs) {
    return false;
  }

  if (query.durationOverMs !== undefined && (asset.audioAnalysis?.durationMs ?? 0) < query.durationOverMs) {
    return false;
  }

  if (query.playable !== undefined && asset.playable !== query.playable) {
    return false;
  }

  if (query.analysisMissing && asset.audioAnalysis) {
    return false;
  }

  const search = query.search?.trim().toLocaleLowerCase("ko-KR");
  if (!search) {
    return true;
  }

  const searchable = [
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

  return searchable.includes(search);
}

function matchesSmartFolder(asset: AssetListItem, smartFolder: SmartFolderId): boolean {
  switch (smartFolder) {
    case "all":
      return !asset.trashedAt;
    case "favorites":
      return !asset.trashedAt && asset.favorite;
    case "recentImports":
      return !asset.trashedAt;
    case "recentPlayed":
      return !asset.trashedAt && Boolean(asset.lastPlayedAt);
    case "shortSounds":
      return !asset.trashedAt && isShortSound(asset);
    case "longBeds":
      return !asset.trashedAt && isLongBed(asset);
    case "uiCandidates":
      return !asset.trashedAt && hasClassification(asset, "ui_sound");
    case "sfxCandidates":
      return !asset.trashedAt && hasClassification(asset, "sfx");
    case "musicCandidates":
      return !asset.trashedAt && hasClassification(asset, "music");
    case "voiceCandidates":
      return !asset.trashedAt && hasClassification(asset, "voice");
    case "ambienceCandidates":
      return !asset.trashedAt && hasClassification(asset, "ambience");
    case "loopCandidates":
      return !asset.trashedAt && (asset.audioAnalysis?.loopLikelihood === "high" || (asset.audioAnalysis?.loopScore ?? 0) >= 0.72 || hasClassification(asset, "loop_candidate"));
    case "similarCandidates":
      return !asset.trashedAt && Boolean(asset.audioFeatures);
    case "highLoopCandidates":
      return !asset.trashedAt && ((asset.audioFeatures?.loopBoundarySimilarity ?? 0) >= 0.72 || (asset.audioAnalysis?.loopScore ?? 0) >= 0.72);
    case "silenceStart":
      return !asset.trashedAt && (asset.audioAnalysis?.silenceStartMs ?? 0) >= 120;
    case "silenceEnd":
      return !asset.trashedAt && (asset.audioAnalysis?.silenceEndMs ?? 0) >= 120;
    case "highPeak":
      return !asset.trashedAt && (asset.audioAnalysis?.peakDb ?? -120) >= -3;
    case "highRms":
      return !asset.trashedAt && (asset.audioAnalysis?.rmsDb ?? -120) >= -14;
    case "featureMissing":
      return !asset.trashedAt && asset.mediaType === "audio" && !asset.audioFeatures;
    case "needsReanalysis":
      return !asset.trashedAt && asset.mediaType === "audio" && asset.audioFeatures?.analyzerVersion !== AUDIO_FEATURE_ANALYZER_VERSION;
    case "retro8BitCandidates":
      return !asset.trashedAt && hasClassification(asset, "retro_8bit_candidate");
    case "retro16BitCandidates":
      return !asset.trashedAt && hasClassification(asset, "retro_16bit_candidate");
    case "analysisFailed":
      return !asset.trashedAt && asset.mediaType === "audio" && !asset.audioAnalysis;
    case "unplayable":
      return !asset.trashedAt && (!asset.playable || asset.fileMissing);
    case "duplicateCandidates":
      return !asset.trashedAt && asset.duplicateCount > 1;
    case "trash":
      return Boolean(asset.trashedAt);
    default:
      return true;
  }
}

function sortAssets(assets: AssetListItem[], sort: AssetSortOption): AssetListItem[] {
  return [...assets].sort((left, right) => {
    switch (sort) {
      case "fileNameAsc":
        return left.fileName.localeCompare(right.fileName, undefined, { sensitivity: "base" });
      case "durationAsc":
        return compareNumbers(left.audioAnalysis?.durationMs, right.audioAnalysis?.durationMs, true);
      case "durationDesc":
        return compareNumbers(left.audioAnalysis?.durationMs, right.audioAnalysis?.durationMs, false);
      case "ratingDesc":
        return compareNumbers(left.rating, right.rating, false) || compareDates(left.createdAt, right.createdAt, false);
      case "lastPlayedDesc":
        return compareDates(left.lastPlayedAt, right.lastPlayedAt, false);
      case "rmsDesc":
        return compareNumbers(left.audioAnalysis?.rmsDb, right.audioAnalysis?.rmsDb, false);
      case "peakDesc":
        return compareNumbers(left.audioAnalysis?.peakDb, right.audioAnalysis?.peakDb, false);
      case "loopScoreDesc":
        return compareNumbers(left.audioAnalysis?.loopScore, right.audioAnalysis?.loopScore, false);
      case "classificationAsc":
        return primaryClassification(left).localeCompare(primaryClassification(right), undefined, { sensitivity: "base" });
      case "formatAsc":
        return (left.audioAnalysis?.format ?? left.fileExt).localeCompare(right.audioAnalysis?.format ?? right.fileExt, undefined, {
          sensitivity: "base",
        });
      case "importedDesc":
      default:
        return compareDates(left.createdAt, right.createdAt, false);
    }
  });
}

function inferSmartFolderSort(smartFolder?: SmartFolderId): AssetSortOption {
  if (smartFolder === "recentPlayed") {
    return "lastPlayedDesc";
  }
  if (smartFolder === "loopCandidates" || smartFolder === "highLoopCandidates") {
    return "loopScoreDesc";
  }
  return "importedDesc";
}

function isShortSound(asset: AssetListItem): boolean {
  const durationMs = asset.audioAnalysis?.durationMs;
  return (durationMs !== undefined && durationMs <= 3000) || hasClassification(asset, "ui_sound") || hasClassification(asset, "sfx");
}

function isLongBed(asset: AssetListItem): boolean {
  const durationMs = asset.audioAnalysis?.durationMs;
  return (durationMs !== undefined && durationMs >= 30000) || hasClassification(asset, "music") || hasClassification(asset, "ambience");
}

function hasClassification(asset: AssetListItem, type: string): boolean {
  return Boolean(asset.audioAnalysis?.classification.some((candidate) => candidate.type === type));
}

function primaryClassification(asset: AssetListItem): string {
  return asset.audioAnalysis?.classification[0]?.type ?? "";
}

function compareNumbers(left: number | null | undefined, right: number | null | undefined, ascending: boolean): number {
  const leftValue = Number.isFinite(left) ? (left as number) : ascending ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const rightValue = Number.isFinite(right) ? (right as number) : ascending ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return ascending ? leftValue - rightValue : rightValue - leftValue;
}

function compareDates(left: string | null | undefined, right: string | null | undefined, ascending: boolean): number {
  const leftMs = left ? Date.parse(left) : ascending ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const rightMs = right ? Date.parse(right) : ascending ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return ascending ? leftMs - rightMs : rightMs - leftMs;
}

function createDuplicateCountMap(rows: AssetRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.content_hash, (counts.get(row.content_hash) ?? 0) + 1);
  }
  return counts;
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function numberOrUndefined(value: number | null): number | undefined {
  return Number.isFinite(value) ? (value as number) : undefined;
}

function inferLoopLikelihood(loopScore: number | null): AudioAnalysisResult["loopLikelihood"] {
  if (!Number.isFinite(loopScore)) {
    return "unknown";
  }
  if ((loopScore as number) >= 0.72) {
    return "high";
  }
  if ((loopScore as number) >= 0.42) {
    return "medium";
  }
  return "low";
}

function clampRating(value: number): number {
  return Math.max(0, Math.min(5, Math.round(value)));
}

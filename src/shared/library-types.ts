import type { AudioAnalysisResult } from "./audio-analysis-types";
import type { AssetAudioFeatureRecord } from "./audio-feature-types";

export type ImportMode = "copy" | "link";
export type MediaType = "audio" | "midi" | "data" | "archive";
export type ViewMode = "list" | "grid";
export type PlaybackErrorCode = "UNSUPPORTED_EXTENSION" | "CODEC_UNSUPPORTED" | "HTML_AUDIO_ERROR" | "FILE_MISSING";
export type SmartFolderId =
  | "all"
  | "favorites"
  | "recentImports"
  | "recentPlayed"
  | "shortSounds"
  | "longBeds"
  | "uiCandidates"
  | "sfxCandidates"
  | "musicCandidates"
  | "voiceCandidates"
  | "ambienceCandidates"
  | "loopCandidates"
  | "similarCandidates"
  | "highLoopCandidates"
  | "silenceStart"
  | "silenceEnd"
  | "highPeak"
  | "highRms"
  | "featureMissing"
  | "needsReanalysis"
  | "retro8BitCandidates"
  | "retro16BitCandidates"
  | "analysisFailed"
  | "unplayable"
  | "duplicateCandidates"
  | "trash";
export type AssetSortOption =
  | "importedDesc"
  | "fileNameAsc"
  | "durationAsc"
  | "durationDesc"
  | "ratingDesc"
  | "lastPlayedDesc"
  | "rmsDesc"
  | "peakDesc"
  | "loopScoreDesc"
  | "classificationAsc"
  | "formatAsc";
export type MetadataExportFormat = "json" | "csv";

export interface LibraryRecord {
  id: string;
  name: string;
  rootPath: string;
  databasePath: string;
  assetsPath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface RecentLibraryRecord {
  id: string;
  libraryPath: string;
  name: string;
  lastOpenedAt: string;
}

export interface TagRecord {
  id: string;
  libraryId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionRecord {
  id: string;
  libraryId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRecord {
  id: string;
  libraryId: string;
  originalPath: string;
  storedPath: string | null;
  fileName: string;
  fileExt: string;
  fileSize: number;
  contentHash: string;
  importMode: ImportMode;
  mediaType: MediaType;
  title: string | null;
  memo: string;
  rating: number;
  favorite: boolean;
  trashedAt: string | null;
  lastPlayedAt: string | null;
  playCount: number;
  playbackSupported: boolean | null;
  playbackErrorCode: PlaybackErrorCode | null;
  fileMissing: boolean;
  fileMissingCheckedAt: string | null;
  relinkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetListItem extends AssetRecord {
  tags: TagRecord[];
  collections: CollectionRecord[];
  audioAnalysis: AudioAnalysisResult | null;
  audioFeatures?: AssetAudioFeatureRecord | null;
  playable: boolean;
  playbackSupportReason: PlaybackErrorCode | null;
  duplicateCount: number;
}

export interface AssetListQuery {
  search?: string;
  smartFolder?: SmartFolderId;
  includeTrashed?: boolean;
  onlyTrashed?: boolean;
  favorite?: boolean;
  minRating?: number;
  tagIds?: string[];
  collectionIds?: string[];
  classificationTypes?: string[];
  loopHigh?: boolean;
  durationUnderMs?: number;
  durationOverMs?: number;
  playable?: boolean;
  analysisMissing?: boolean;
  sort?: AssetSortOption;
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

export interface AssetListPage {
  items: AssetListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssetUpdateInput {
  title?: string | null;
  memo?: string;
  rating?: number;
  favorite?: boolean;
}

export interface PlaybackSupportUpdateInput {
  supported: boolean;
  errorCode?: PlaybackErrorCode | null;
}

export interface BatchResult {
  requested: number;
  success: number;
  failed: number;
  skipped: number;
  failures: Array<{ assetId: string; reason: string }>;
  warnings: string[];
}

export interface ImportFilesResult extends BatchResult {
  importedAssetIds: string[];
  summary: {
    requested: number;
    success: number;
    duplicateSkipped: number;
    unsupportedSkipped: number;
    analysisFailed: number;
    copyFailed: number;
    otherFailed: number;
  };
}

export interface AppliedTagRecord {
  id: string;
  name: string;
}

export interface ApplySuggestedTagsResult {
  applied: AppliedTagRecord[];
  alreadyLinked: AppliedTagRecord[];
  skipped: string[];
}

export interface LibrarySnapshot {
  library: LibraryRecord;
  tags: TagRecord[];
  collections: CollectionRecord[];
}

export interface LibraryDiagnostics {
  ok: boolean;
  dbIntegrity: string;
  migrationVersion: string;
  assetCount: number;
  missingFiles: number;
  analysisMissing: number;
  analysisFailed: number;
  unplayableAssets: number;
  trashedAssets: number;
  duplicateHashes: number;
  duplicateGroups: number;
  orphanTags: number;
  orphanCollectionRelations: number;
  orphanAnalysisRows: number;
  copyAssetsMissingFiles: number;
  waveformMissing: number;
  importWarnings: number;
  repairableItems: Array<{
    id: string;
    label: string;
    count: number;
    action: "markMissing" | "clearOrphans" | "none";
  }>;
  logPath: string;
}

export interface MissingFileRecord {
  assetId: string;
  fileName: string;
  expectedPath: string;
  importMode: ImportMode;
  fileSize: number;
  contentHash: string;
  checkedAt: string;
}

export interface RelinkCandidate {
  assetId: string;
  fileName: string;
  currentPath: string;
  candidatePath: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  hashMatches: boolean;
  sizeMatches: boolean;
}

export interface RelinkResult {
  assetId: string;
  updatedAsset: AssetListItem | null;
  previousPath: string;
  nextPath: string;
  copiedIntoLibrary: boolean;
}

export interface BulkRelinkPreview {
  baseFolder: string;
  candidates: RelinkCandidate[];
  unmatched: MissingFileRecord[];
}

export interface DuplicateAssetSummary {
  asset: AssetListItem;
  tagNames: string[];
  collectionNames: string[];
}

export interface DuplicateGroupSummary {
  contentHash: string;
  fileSize: number;
  count: number;
  ignored: boolean;
  assets: DuplicateAssetSummary[];
}

export interface DuplicateMergeInput {
  contentHash: string;
  keepAssetId: string;
  mergeAssetIds: string[];
  mergeTags?: boolean;
  mergeCollections?: boolean;
  mergeFavorite?: boolean;
  mergeRating?: "highest" | "keep";
}

export interface BackupPreview {
  destinationPath: string;
  finalPath: string;
  assetCount: number;
  tagCount: number;
  collectionCount: number;
  includesCopiedAssets: boolean;
  includesCache: boolean;
  linkModeWarning: string | null;
}

export interface BackupManifest {
  app: "Suwol Audio Reference";
  backupVersion: 1;
  libraryName: string;
  libraryId: string;
  createdAt: string;
  assetCount: number;
  tagCount: number;
  collectionCount: number;
  includesCopiedAssets: boolean;
  includesCache: boolean;
  sourceRootPath: string;
}

export interface BackupResult {
  destinationPath: string;
  manifestPath: string;
  manifest: BackupManifest;
  copiedFiles: number;
  warnings: string[];
}

export interface RestorePreview {
  sourcePath: string;
  manifest: BackupManifest | null;
  hasDatabase: boolean;
  canRestore: boolean;
  warnings: string[];
}

export interface MetadataExportOptions {
  format: MetadataExportFormat;
  includePaths: boolean;
  includeTrashed: boolean;
  includeAnalysis: boolean;
  includePlayback: boolean;
}

export interface MetadataExportResult {
  outputPath: string;
  format: MetadataExportFormat;
  fileCount: number;
  assetCount: number;
  warnings: string[];
}

export interface TagUsageRecord extends TagRecord {
  assetCount: number;
}

export interface CollectionUsageRecord extends CollectionRecord {
  assetCount: number;
}

export interface ImportSourceRecord {
  id: string;
  libraryId: string;
  path: string;
  importMode: ImportMode;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportSourceScanResult {
  source: ImportSourceRecord;
  scannedAt: string;
  newFiles: string[];
  duplicateFiles: string[];
  unsupportedFiles: string[];
  missingLinkedFiles: string[];
}

export interface SidecarExportResult {
  requested: number;
  success: number;
  failed: number;
  files: string[];
  failures: Array<{ assetId: string; reason: string }>;
}

import type {
  ApplySuggestedTagsResult,
  AssetListPage,
  AssetListItem,
  AssetListQuery,
  AssetUpdateInput,
  BatchResult,
  BackupPreview,
  BackupResult,
  CollectionRecord,
  CollectionUsageRecord,
  DuplicateGroupSummary,
  DuplicateMergeInput,
  BulkRelinkPreview,
  ImportFilesResult,
  ImportSourceRecord,
  ImportSourceScanResult,
  LibrarySnapshot,
  LibraryDiagnostics,
  MetadataExportOptions,
  MetadataExportResult,
  MissingFileRecord,
  PlaybackSupportUpdateInput,
  RecentLibraryRecord,
  RelinkCandidate,
  RelinkResult,
  RestorePreview,
  SidecarExportResult,
  TagRecord,
  TagUsageRecord,
} from "./library-types";
import type { AudioAnalysisResult } from "./audio-analysis-types";
import type {
  AssetAudioFeatureRecord,
  FeatureRerunBatchInput,
  FeatureRerunBatchResult,
  SimilarityExplanation,
  SimilaritySearchInput,
  SimilaritySearchResult,
} from "./audio-feature-types";
import type {
  AssetRightsInput,
  AssetRightsMetadata,
  CodexInstructionPreviewInput,
  ExportOptions,
  ExportPresetInput,
  ExportPresetRecord,
  ExportPreview,
  ExportRunResult,
  ManifestPreviewInput,
} from "./export-types";
import type { Locale } from "./i18n/locales";
import type { AppSettings, QuickPreviewSettingsInput } from "./settings-types";

export interface SuwolAudioApi {
  library: {
    create: (options?: { rootPath?: string; name?: string }) => Promise<LibrarySnapshot | null>;
    open: (options?: { rootPath?: string }) => Promise<LibrarySnapshot | null>;
    recentList: () => Promise<RecentLibraryRecord[]>;
    backupPreview: (options?: { destinationPath?: string }) => Promise<BackupPreview | null>;
    backupStart: (options?: { destinationPath?: string }) => Promise<BackupResult | null>;
    restorePreview: (options?: { sourcePath?: string }) => Promise<RestorePreview | null>;
    exportMetadata: (options?: Partial<MetadataExportOptions> & { outputPath?: string }) => Promise<MetadataExportResult | null>;
  };
  assets: {
    importFiles: (options?: { filePaths?: string[]; importMode?: "copy" | "link" }) => Promise<ImportFilesResult>;
    list: (query?: AssetListQuery) => Promise<AssetListPage>;
    get: (assetId: string) => Promise<AssetListItem | null>;
    update: (assetId: string, input: AssetUpdateInput) => Promise<AssetListItem>;
    quickTag: (input: { assetId: string; tagName: string }) => Promise<BatchResult>;
    batchQuickTag: (input: { assetIds: string[]; tagName: string }) => Promise<BatchResult>;
    trash: (assetIds: string[]) => Promise<BatchResult>;
    restore: (assetIds: string[]) => Promise<BatchResult>;
    deletePermanent: (assetIds: string[]) => Promise<BatchResult>;
    listMissing: () => Promise<MissingFileRecord[]>;
    relink: (input: { assetId: string; newPath?: string; copyIntoLibrary?: boolean }) => Promise<RelinkResult | null>;
    bulkRelinkPreview: (input?: { baseFolder?: string }) => Promise<BulkRelinkPreview | null>;
    bulkRelinkApply: (input: { candidates: RelinkCandidate[]; copyIntoLibrary?: boolean }) => Promise<BatchResult>;
    exportSidecars: (input: { assetIds: string[]; overwrite?: boolean }) => Promise<SidecarExportResult>;
  };
  tags: {
    list: () => Promise<TagRecord[]>;
    listWithUsage: () => Promise<TagUsageRecord[]>;
    create: (input: { name: string; color?: string }) => Promise<TagRecord>;
    rename: (input: { tagId: string; name: string; color?: string }) => Promise<TagRecord>;
    merge: (input: { sourceTagIds: string[]; targetTagId: string }) => Promise<BatchResult>;
    delete: (tagIds: string[]) => Promise<BatchResult>;
    deleteUnused: () => Promise<BatchResult>;
    applyToAssets: (input: { assetIds: string[]; tagNames: string[] }) => Promise<BatchResult>;
    removeFromAssets: (input: { assetIds: string[]; tagIds: string[] }) => Promise<BatchResult>;
  };
  collections: {
    list: () => Promise<CollectionRecord[]>;
    listWithUsage: () => Promise<CollectionUsageRecord[]>;
    create: (input: { name: string; description?: string }) => Promise<CollectionRecord>;
    rename: (input: { collectionId: string; name: string }) => Promise<CollectionRecord>;
    updateDescription: (input: { collectionId: string; description: string }) => Promise<CollectionRecord>;
    delete: (collectionIds: string[]) => Promise<BatchResult>;
    deleteEmpty: () => Promise<BatchResult>;
    addAssets: (input: { collectionId: string; assetIds: string[] }) => Promise<BatchResult>;
    removeAssets: (input: { collectionId: string; assetIds: string[] }) => Promise<BatchResult>;
  };
  duplicates: {
    listGroups: () => Promise<DuplicateGroupSummary[]>;
    mergeMetadata: (input: DuplicateMergeInput) => Promise<BatchResult>;
    trashDuplicates: (input: { keepAssetId: string; duplicateAssetIds: string[] }) => Promise<BatchResult>;
    ignoreGroup: (contentHash: string) => Promise<BatchResult>;
  };
  importSources: {
    list: () => Promise<ImportSourceRecord[]>;
    add: (input?: { path?: string; importMode?: "copy" | "link" }) => Promise<ImportSourceRecord | null>;
    scan: (sourceId: string) => Promise<ImportSourceScanResult>;
    importNew: (sourceId: string) => Promise<ImportFilesResult>;
  };
  export: {
    preview: (input: Partial<ExportOptions> & { outputPath?: string }) => Promise<ExportPreview>;
    run: (input: Partial<ExportOptions> & { outputPath?: string }) => Promise<ExportRunResult | null>;
    presetsList: () => Promise<ExportPresetRecord[]>;
    presetsSave: (input: ExportPresetInput) => Promise<ExportPresetRecord>;
    presetsDelete: (presetId: string) => Promise<BatchResult>;
    showOutputPath: (path: string) => Promise<boolean>;
  };
  rights: {
    get: (assetId: string) => Promise<AssetRightsMetadata>;
    update: (assetId: string, input: AssetRightsInput) => Promise<AssetRightsMetadata>;
    batchUpdate: (input: { assetIds: string[]; rights: AssetRightsInput }) => Promise<BatchResult>;
  };
  codex: {
    previewInstruction: (input: CodexInstructionPreviewInput) => Promise<string>;
  };
  manifest: {
    preview: (input: ManifestPreviewInput) => Promise<string>;
  };
  analysis: {
    get: (assetId: string) => Promise<AudioAnalysisResult | null>;
    rerun: (assetId: string) => Promise<AudioAnalysisResult | null>;
    featuresGet: (assetId: string) => Promise<AssetAudioFeatureRecord | null>;
    featuresRerun: (assetId: string) => Promise<AssetAudioFeatureRecord | null>;
    featuresRerunBatch: (input?: FeatureRerunBatchInput) => Promise<FeatureRerunBatchResult>;
    applySuggestedTags: (input: { assetId: string; tagNames: string[]; locale?: Locale }) => Promise<ApplySuggestedTagsResult>;
  };
  similarity: {
    findForAsset: (input: SimilaritySearchInput) => Promise<SimilaritySearchResult>;
    explain: (input: { assetId: string; candidateAssetId: string }) => Promise<SimilarityExplanation>;
  };
  audio: {
    getPlaybackUrl: (assetId: string) => Promise<string | null>;
  };
  playback: {
    recordPlayed: (assetId: string) => Promise<AssetListItem | null>;
    updateSupportState: (assetId: string, input: PlaybackSupportUpdateInput) => Promise<AssetListItem | null>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    setLocale: (locale: Locale) => Promise<AppSettings>;
    updateQuickPreview: (input: QuickPreviewSettingsInput) => Promise<AppSettings>;
  };
  diagnostics: {
    runLibraryDiagnostics: () => Promise<LibraryDiagnostics | null>;
    openLogFolder: () => Promise<string>;
    recentLogs: (limit?: number) => Promise<string[]>;
    logRendererError: (input: { message: string; stack?: string; componentStack?: string }) => Promise<boolean>;
  };
  menu: {
    onCommand: (callback: (command: "library:create" | "library:open" | "assets:import") => void) => () => void;
  };
}

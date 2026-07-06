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
  ExportHistoryListQuery,
  ExportHistoryRecord,
  ExportOptions,
  ExportPresetInput,
  ExportPresetRecord,
  ExportPreview,
  ExportRunResult,
  ManifestPreviewInput,
  ProjectExportSourceSummary,
} from "./export-types";
import type { Locale } from "./i18n/locales";
import type { AppSettings, AppUpdateSettingsInput, QuickPreviewSettingsInput } from "./settings-types";
import type { UpdateState } from "./update-types";
import type { ReleaseStatus } from "./release-status-types";
import type {
  ProjectSoundPackDryRun,
  ProjectSoundPackExportResult,
  ProjectSoundPackOptions,
  ProjectSoundPackProfile,
} from "./project-sound-pack-types";
import type {
  GameProjectInput,
  GameProjectRecord,
  GameProjectUpdateInput,
  MissingSoundReport,
  SoundBoardExportOptions,
  SoundBoardExportPreview,
  SoundBoardExportResult,
  SoundBoardSummary,
  SoundBoardValidationResult,
  SoundChangeReviewBaselineInput,
  SoundChangeReviewBulkUpdateInput,
  SoundChangeReviewCreateInput,
  SoundChangeReviewDetail,
  SoundChangeReviewExportOptions,
  SoundChangeReviewExportPreview,
  SoundChangeReviewExportResult,
  SoundChangeReviewItemRecord,
  SoundChangeReviewItemUpdateInput,
  SoundChangeReviewListQuery,
  SoundChangeReviewRecord,
  SoundChangeReviewUpdateInput,
  SoundCandidateReviewInput,
  SoundCandidateSuggestInput,
  SoundCandidateSuggestion,
  SoundPackChangelogOptions,
  SoundPackChangelogPreview,
  SoundPackChangelogResult,
  SoundPackCompareInput,
  SoundPackDiffResult,
  SoundPackRollbackApplyInput,
  SoundPackRollbackPreview,
  SoundPackRollbackResult,
  SoundPackSnapshotDetail,
  SoundPackSnapshotInput,
  SoundPackSnapshotRecord,
  SoundProjectChecklistItemInput,
  SoundProjectChecklistItemRecord,
  SoundProjectChecklistItemUpdateInput,
  SoundProjectChecklistListResult,
  SoundProjectStyleGuideInput,
  SoundProjectStyleGuideRecord,
  SoundRequestExportOptions,
  SoundRequestExportPreview,
  SoundRequestExportResult,
  SoundUsageAssetLink,
  SoundUsageBulkCreateInput,
  SoundUsageBulkPreview,
  SoundUsageBulkPreviewInput,
  SoundUsageCandidateInput,
  SoundUsageCandidateRecord,
  SoundUsageCandidateUpdateInput,
  SoundUsageCustomTemplateInput,
  SoundUsageItemInput,
  SoundUsageItemRecord,
  SoundUsageItemUpdateInput,
  SoundUsageWorkflowUpdateInput,
  SoundUsageListQuery,
  SoundUsageTemplate,
  SoundUsageTemplateApplyInput,
  SoundUsageTemplateApplyPreview,
  SoundUsageTemplateId,
  SoundWorkTodoItem,
  SoundWorkTodoQuery,
  SoundWorkTodoSummary,
} from "./sound-board-types";

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
    projectSourcesList: () => Promise<ProjectExportSourceSummary[]>;
    historyList: (query?: ExportHistoryListQuery) => Promise<ExportHistoryRecord[]>;
    historyGet: (historyId: string) => Promise<ExportHistoryRecord | null>;
    historyDelete: (historyId: string) => Promise<BatchResult>;
    showOutputPath: (path: string) => Promise<boolean>;
  };
  projects: {
    list: (input?: { includeArchived?: boolean }) => Promise<GameProjectRecord[]>;
    create: (input: GameProjectInput) => Promise<GameProjectRecord>;
    update: (projectId: string, input: GameProjectUpdateInput) => Promise<GameProjectRecord>;
    archive: (projectId: string) => Promise<GameProjectRecord>;
    getSummary: (projectId: string) => Promise<SoundBoardSummary>;
  };
  usage: {
    list: (query: SoundUsageListQuery) => Promise<SoundUsageItemRecord[]>;
    get: (usageItemId: string) => Promise<SoundUsageItemRecord | null>;
    create: (input: SoundUsageItemInput) => Promise<SoundUsageItemRecord>;
    update: (usageItemId: string, input: SoundUsageItemUpdateInput) => Promise<SoundUsageItemRecord>;
    delete: (usageItemId: string) => Promise<SoundUsageItemRecord>;
    bulkPreview: (input: SoundUsageBulkPreviewInput) => Promise<SoundUsageBulkPreview>;
    bulkCreate: (input: SoundUsageBulkCreateInput) => Promise<BatchResult>;
    templatesList: () => Promise<SoundUsageTemplate[]>;
    bulkCreateFromTemplate: (input: { projectId: string; templateId: SoundUsageTemplateId }) => Promise<BatchResult>;
    getSummary: (projectId: string) => Promise<SoundBoardSummary>;
    getMissingReport: (projectId: string) => Promise<MissingSoundReport>;
    validateBoard: (projectId: string) => Promise<SoundBoardValidationResult>;
    getAssetLinks: (assetId: string) => Promise<SoundUsageAssetLink[]>;
    updateStatus: (usageItemId: string, input: { status: SoundUsageItemRecord["status"]; note?: string }) => Promise<SoundUsageItemRecord>;
    applySuggestedKey: (usageItemId: string, input?: { suggestedKey?: string }) => Promise<SoundUsageItemRecord>;
  };
  usageTemplates: {
    list: () => Promise<SoundUsageTemplate[]>;
    createFromProject: (input: SoundUsageCustomTemplateInput) => Promise<SoundUsageTemplate>;
    previewApply: (input: SoundUsageTemplateApplyInput) => Promise<SoundUsageTemplateApplyPreview>;
    apply: (input: SoundUsageTemplateApplyInput) => Promise<BatchResult>;
    rename: (templateId: string, input: { name: string }) => Promise<SoundUsageTemplate>;
    delete: (templateId: string) => Promise<BatchResult>;
  };
  usageCandidates: {
    list: (usageItemId: string) => Promise<SoundUsageCandidateRecord[]>;
    add: (input: SoundUsageCandidateInput) => Promise<SoundUsageCandidateRecord>;
    remove: (candidateId: string) => Promise<boolean>;
    update: (candidateId: string, input: SoundUsageCandidateUpdateInput) => Promise<SoundUsageCandidateRecord>;
    setSelected: (candidateId: string, selected: boolean) => Promise<SoundUsageCandidateRecord>;
    setRejected: (candidateId: string, rejected: boolean) => Promise<SoundUsageCandidateRecord>;
    suggest: (input: SoundCandidateSuggestInput) => Promise<SoundCandidateSuggestion[]>;
    findSimilarForUsage: (input: SoundCandidateSuggestInput) => Promise<SoundCandidateSuggestion[]>;
    bulkAdd: (input: { usageItemId: string; assetIds: string[]; selected?: boolean }) => Promise<BatchResult>;
  };
  soundWorkflow: {
    getTodoSummary: (projectId: string) => Promise<SoundWorkTodoSummary>;
    listTodoItems: (query: SoundWorkTodoQuery) => Promise<SoundWorkTodoItem[]>;
    updateUsageWorkflow: (usageItemId: string, input: SoundUsageWorkflowUpdateInput) => Promise<SoundUsageItemRecord>;
    updateCandidateReview: (candidateId: string, input: SoundCandidateReviewInput) => Promise<SoundUsageCandidateRecord>;
  };
  soundStyleGuide: {
    get: (projectId: string) => Promise<SoundProjectStyleGuideRecord>;
    update: (projectId: string, input: SoundProjectStyleGuideInput) => Promise<SoundProjectStyleGuideRecord>;
  };
  soundChecklist: {
    list: (projectId: string) => Promise<SoundProjectChecklistListResult>;
    addBuiltins: (projectId: string) => Promise<SoundProjectChecklistListResult>;
    create: (input: SoundProjectChecklistItemInput) => Promise<SoundProjectChecklistItemRecord>;
    update: (itemId: string, input: SoundProjectChecklistItemUpdateInput) => Promise<SoundProjectChecklistItemRecord>;
    delete: (itemId: string) => Promise<boolean>;
  };
  soundRequest: {
    preview: (input: SoundRequestExportOptions & { outputPath?: string }) => Promise<SoundRequestExportPreview>;
    export: (input: SoundRequestExportOptions & { outputPath?: string }) => Promise<SoundRequestExportResult | null>;
  };
  soundSnapshots: {
    list: (projectId: string) => Promise<SoundPackSnapshotRecord[]>;
    create: (input: SoundPackSnapshotInput) => Promise<SoundPackSnapshotDetail>;
    get: (snapshotId: string) => Promise<SoundPackSnapshotDetail | null>;
    delete: (snapshotId: string) => Promise<BatchResult>;
    freeze: (snapshotId: string) => Promise<SoundPackSnapshotDetail>;
    setBaseline: (snapshotId: string) => Promise<GameProjectRecord>;
    compare: (input: SoundPackCompareInput) => Promise<SoundPackDiffResult>;
    compareCurrent: (input: { projectId: string; fromSnapshotId: string }) => Promise<SoundPackDiffResult>;
    rollbackPreview: (snapshotId: string) => Promise<SoundPackRollbackPreview>;
    rollbackApply: (input: SoundPackRollbackApplyInput) => Promise<SoundPackRollbackResult>;
    changelogPreview: (input: SoundPackChangelogOptions) => Promise<SoundPackChangelogPreview>;
    changelogExport: (input: SoundPackChangelogOptions & { outputPath?: string }) => Promise<SoundPackChangelogResult | null>;
  };
  changeReviews: {
    list: (query: SoundChangeReviewListQuery) => Promise<SoundChangeReviewRecord[]>;
    createFromDiff: (input: SoundChangeReviewCreateInput) => Promise<SoundChangeReviewDetail>;
    createFromBaseline: (input: SoundChangeReviewBaselineInput) => Promise<SoundChangeReviewDetail>;
    get: (reviewId: string) => Promise<SoundChangeReviewDetail | null>;
    update: (reviewId: string, input: SoundChangeReviewUpdateInput) => Promise<SoundChangeReviewDetail>;
    archive: (reviewId: string) => Promise<SoundChangeReviewDetail>;
    updateItemStatus: (itemId: string, input: SoundChangeReviewItemUpdateInput) => Promise<SoundChangeReviewItemRecord>;
    bulkUpdateItems: (input: SoundChangeReviewBulkUpdateInput) => Promise<SoundChangeReviewDetail>;
    updateItemNote: (itemId: string, input: SoundChangeReviewItemUpdateInput) => Promise<SoundChangeReviewItemRecord>;
    exportPreview: (input: SoundChangeReviewExportOptions) => Promise<SoundChangeReviewExportPreview>;
    export: (input: SoundChangeReviewExportOptions & { outputPath?: string }) => Promise<SoundChangeReviewExportResult | null>;
  };
  soundBoardExport: {
    projectPreview: (input: SoundBoardExportOptions & { outputPath?: string }) => Promise<SoundBoardExportPreview>;
    projectRun: (input: SoundBoardExportOptions & { outputPath?: string }) => Promise<SoundBoardExportResult | null>;
  };
  projectSoundPack: {
    getProfiles: () => Promise<ProjectSoundPackProfile[]>;
    preview: (input: ProjectSoundPackOptions) => Promise<ProjectSoundPackDryRun>;
    export: (input: ProjectSoundPackOptions) => Promise<ProjectSoundPackExportResult | null>;
    openOutput: (outputPath: string) => Promise<boolean>;
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
    updateUpdates: (input: AppUpdateSettingsInput) => Promise<AppSettings>;
  };
  updates: {
    getState: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    download: () => Promise<UpdateState>;
    install: () => Promise<UpdateState>;
    openReleasePage: () => Promise<UpdateState>;
    onStateChanged: (callback: (state: UpdateState) => void) => () => void;
  };
  releaseStatus: {
    get: () => Promise<ReleaseStatus>;
    openReleases: () => Promise<ReleaseStatus>;
    openLatestRelease: () => Promise<ReleaseStatus>;
    openChecksumsHelp: () => Promise<ReleaseStatus>;
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

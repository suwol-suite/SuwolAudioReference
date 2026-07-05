import type { AssetListItem, AssetListQuery, SmartFolderId } from "./library-types";
import type { GameEngineType, GameProjectRecord, SoundBoardSummary } from "./sound-board-types";

export type ExportTargetType =
  | "codex_markdown"
  | "codex_json"
  | "generic_manifest"
  | "unity_manifest"
  | "unreal_json"
  | "unreal_csv"
  | "monogame_manifest"
  | "monogame_content"
  | "sound_pack_metadata"
  | "sound_pack_folder"
  | "csv_report"
  | "project_sound_pack"
  | "project_manifest"
  | "project_missing_report"
  | "project_codex_instruction"
  | "sound_request_markdown"
  | "sound_request_csv"
  | "sound_request_json"
  | "project_style_guide_markdown"
  | "project_checklist_markdown"
  | "sound_pack_snapshot_json"
  | "sound_pack_changelog_markdown"
  | "sound_pack_changelog_json"
  | "sound_pack_changelog_csv"
  | "sound_change_review_markdown"
  | "sound_change_review_json"
  | "sound_change_review_csv";

export type ExportPresetType =
  | "codex_instruction"
  | "generic_manifest"
  | "unity_manifest"
  | "unreal_manifest"
  | "monogame_manifest"
  | "sound_pack"
  | "csv_report"
  | "project_sound_pack"
  | "project_manifest"
  | "project_missing_report"
  | "project_codex_instruction"
  | "sound_request_markdown"
  | "sound_request_csv"
  | "sound_request_json"
  | "project_style_guide_markdown"
  | "project_checklist_markdown"
  | "sound_pack_snapshot_json"
  | "sound_pack_changelog_markdown"
  | "sound_pack_changelog_json"
  | "sound_pack_changelog_csv"
  | "sound_change_review_markdown"
  | "sound_change_review_json"
  | "sound_change_review_csv";

export type ExportSource =
  | { type: "selected"; assetIds: string[] }
  | { type: "query"; query: AssetListQuery; label?: string }
  | { type: "collection"; collectionId: string; name?: string }
  | { type: "tag"; tagId: string; name?: string }
  | { type: "smartFolder"; smartFolder: SmartFolderId; name?: string }
  | { type: "gameProject"; projectId: string; name?: string; usageItemIds?: string[]; label?: string }
  | { type: "library" };

export type CodexInstructionTemplate =
  | "unity_import_plan"
  | "unreal_import_plan"
  | "monogame_import_plan"
  | "generic_game_audio_manifest"
  | "rename_plan"
  | "tag_cleanup_plan"
  | "sound_usage_map"
  | "audio_replacement_candidates"
  | "custom_instruction";

export type ExportGrouping = "none" | "category" | "tag";
export type ExportValidationSeverity = "info" | "warning" | "error";
export type CommercialUseStatus = "unknown" | "allowed" | "not_allowed" | "check_required";
export type CreditRequiredStatus = "unknown" | "yes" | "no";
export type ExportHistoryStatus = "success" | "failure";
export type ProjectExportFilenamePolicy = "keep_original" | "usage_key" | "category_usage_key";

export interface AssetRightsMetadata {
  assetId: string;
  sourceName: string;
  sourceUrl: string;
  author: string;
  licenseName: string;
  licenseUrl: string;
  attributionText: string;
  usageNotes: string;
  commercialUseStatus: CommercialUseStatus;
  creditRequired: CreditRequiredStatus;
  createdAt: string;
  updatedAt: string;
}

export type AssetRightsInput = Partial<
  Pick<
    AssetRightsMetadata,
    | "sourceName"
    | "sourceUrl"
    | "author"
    | "licenseName"
    | "licenseUrl"
    | "attributionText"
    | "usageNotes"
    | "commercialUseStatus"
    | "creditRequired"
  >
>;

export interface ExportOptions {
  target: ExportTargetType;
  source: ExportSource;
  includeTrashed: boolean;
  includeAbsolutePaths: boolean;
  includeCollections: boolean;
  includeMemo: boolean;
  includeRights: boolean;
  copyAudioFiles: boolean;
  groupBy: ExportGrouping;
  useSafeFilenames: boolean;
  codexGoal: string;
  codexTemplate: CodexInstructionTemplate;
  soundPackName: string;
  acknowledgeWarnings?: boolean;
  engineProfile?: GameEngineType;
  filenamePolicy?: ProjectExportFilenamePolicy;
  approvedOnly?: boolean;
  includeSelectedUnapproved?: boolean;
  includeCandidates?: boolean;
  includeRejectedCandidates?: boolean;
  includeMissingItems?: boolean;
  includeUsageNotes?: boolean;
  includeBoardSummary?: boolean;
  includeValidationReport?: boolean;
  includeMissingReport?: boolean;
  includeReadme?: boolean;
  includeCredits?: boolean;
  includeManifest?: boolean;
  includeStyleGuide?: boolean;
  includeChecklist?: boolean;
  includeWorkNotes?: boolean;
  includeReviewNotes?: boolean;
  includeCandidateReviewNotes?: boolean;
  includeDecisionNotes?: boolean;
  snapshotId?: string;
  fromSnapshotId?: string;
  toSnapshotId?: string;
  baselineSnapshotId?: string;
  compareToCurrent?: boolean;
  createSnapshotBeforeExport?: boolean;
  useSnapshotAsExportSource?: boolean;
  includeDiffSummary?: boolean;
  includeRightsChanges?: boolean;
  includeRiskChanges?: boolean;
  includeCandidateChanges?: boolean;
  reviewId?: string;
  includePending?: boolean;
  includeApproved?: boolean;
  includeRejected?: boolean;
  includeDeferred?: boolean;
  includeReviewerNotes?: boolean;
  includeDecisionReasons?: boolean;
  includeBeforeAfterDetails?: boolean;
  includeReviewDecisions?: boolean;
  approvedChangesOnly?: boolean;
  excludeRejectedChanges?: boolean;
  includeDeferredChanges?: boolean;
  includeLatestChangeReviewSummary?: boolean;
  includeReviewReport?: boolean;
}

export interface ExportValidationIssue {
  severity: ExportValidationSeverity;
  code:
    | "NO_ASSETS"
    | "MISSING_FILE"
    | "PLAYBACK_UNSUPPORTED"
    | "DUPLICATE_ENGINE_KEY"
    | "DUPLICATE_OUTPUT_FILE"
    | "UNKNOWN_LICENSE"
    | "CREDIT_MISSING"
    | "LOOP_FLAG_MISMATCH"
    | "ABSOLUTE_PATH_INCLUDED"
    | "EXPORT_TARGET_EXISTS"
    | "EXPORT_TYPE_SOURCE_MISMATCH"
    | "PROJECT_NOT_FOUND"
    | "SNAPSHOT_NOT_FOUND"
    | "SNAPSHOT_COMPARE_FAILED"
    | "PROJECT_SOUND_PACK_VALIDATION_BLOCKED";
  message: string;
  assetId?: string;
  fileName?: string;
}

export interface PlannedExportFile {
  path: string;
  kind: "manifest" | "markdown" | "json" | "csv" | "text" | "audio" | "metadata" | "report";
  assetId?: string;
}

export interface ExportPreview {
  ok: boolean;
  target: ExportTargetType;
  assetCount: number;
  exportSourceLabel: string;
  issues: ExportValidationIssue[];
  plannedFiles: PlannedExportFile[];
}

export interface ExportRunSummary {
  requested: number;
  exported: number;
  skipped: number;
  failed: number;
  warnings: string[];
}

export interface ExportRunResult {
  ok: boolean;
  outputPath?: string;
  files: string[];
  summary: ExportRunSummary;
  error?: {
    code: string;
    message: string;
  };
}

export interface ExportPresetRecord {
  id: string;
  libraryId: string | null;
  name: string;
  type: ExportPresetType;
  config: Partial<ExportOptions>;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExportPresetInput {
  id?: string;
  name: string;
  type: ExportPresetType;
  config: Partial<ExportOptions>;
}

export interface ProjectExportSourceSummary {
  project: GameProjectRecord;
  summary: SoundBoardSummary;
  validationOk: boolean;
  riskCount: number;
}

export interface ExportHistoryRecord {
  id: string;
  libraryId: string;
  createdAt: string;
  status: ExportHistoryStatus;
  target: ExportTargetType;
  sourceLabel: string;
  outputPath: string | null;
  files: string[];
  summary: ExportRunSummary;
  errorCode: string | null;
  errorMessage: string | null;
  options: Partial<ExportOptions>;
  snapshotId?: string | null;
  baselineSnapshotId?: string | null;
  diffSummary?: Record<string, unknown> | null;
  reviewId?: string | null;
}

export interface ExportHistoryListQuery {
  limit?: number;
  target?: ExportTargetType;
  projectId?: string;
  snapshotId?: string;
}

export interface ExportAssetContext {
  asset: AssetListItem;
  relativePath: string;
  outputFileName: string;
  category: string;
  engineKey: string;
  loop: boolean;
  volumeHint: number;
  usageHint: string;
  rights: AssetRightsMetadata;
}

export interface CodexInstructionPreviewInput {
  source: ExportSource;
  goal: string;
  template: CodexInstructionTemplate;
  includeAbsolutePaths?: boolean;
  includeRights?: boolean;
}

export interface ManifestPreviewInput {
  source: ExportSource;
  target?: Extract<
    ExportTargetType,
    "generic_manifest" | "unity_manifest" | "unreal_json" | "unreal_csv" | "monogame_manifest" | "monogame_content"
  >;
  includeAbsolutePaths?: boolean;
  includeRights?: boolean;
}

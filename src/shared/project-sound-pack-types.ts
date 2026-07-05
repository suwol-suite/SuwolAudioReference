import type { AssetRightsMetadata } from "./export-types";
import type {
  GameEngineType,
  SoundChangeReviewSummary,
  SoundBoardValidationSeverity,
  SoundUsageCategory,
  SoundUsagePriority,
  SoundUsageStatus,
} from "./sound-board-types";

export type ProjectSoundPackEngineProfile = GameEngineType;
export type ProjectSoundPackFilenamePolicy = "keep_original" | "usage_key" | "category_usage_key";

export interface ProjectSoundPackOptions {
  projectId: string;
  engineProfile?: ProjectSoundPackEngineProfile;
  soundPackName?: string;
  usageItemIds?: string[];
  approvedOnly?: boolean;
  includeSelectedUnapproved?: boolean;
  includeCandidates?: boolean;
  includeRejectedCandidates?: boolean;
  includeMissingReport?: boolean;
  includeValidationReport?: boolean;
  includeRights?: boolean;
  includeBoardSummary?: boolean;
  includeReadme?: boolean;
  includeCredits?: boolean;
  includeManifest?: boolean;
  includeStyleGuide?: boolean;
  includeChecklist?: boolean;
  includeWorkNotes?: boolean;
  includeReviewNotes?: boolean;
  includeCandidateReviewNotes?: boolean;
  includeDecisionNotes?: boolean;
  includeLatestChangeReviewSummary?: boolean;
  includeReviewReport?: boolean;
  copyAudioFiles?: boolean;
  filenamePolicy?: ProjectSoundPackFilenamePolicy;
  blockIfRequiredMissing?: boolean;
  blockIfSelectedFileMissing?: boolean;
  blockIfUnknownLicense?: boolean;
  blockIfCreditMissing?: boolean;
  blockIfLoopMismatch?: boolean;
  blockIfPlaybackUnsupported?: boolean;
  blockIfDuplicateOutputFilename?: boolean;
  acknowledgeWarnings?: boolean;
  outputPath?: string;
}

export interface ProjectSoundPackProfile {
  id: ProjectSoundPackEngineProfile;
  name: string;
  audioRoot: string;
  manifestFiles: string[];
}

export type ProjectSoundPackIssueCode =
  | "PROJECT_SOUND_PACK_NO_PROJECT"
  | "PROJECT_SOUND_PACK_NO_SELECTED_ASSETS"
  | "PROJECT_SOUND_PACK_OUTPUT_EXISTS"
  | "PROJECT_SOUND_PACK_WRITE_FAILED"
  | "PROJECT_SOUND_PACK_MISSING_FILE"
  | "PROJECT_SOUND_PACK_DUPLICATE_OUTPUT"
  | "PROJECT_SOUND_PACK_VALIDATION_BLOCKED"
  | "REQUIRED_MISSING"
  | "SELECTED_NOT_APPROVED"
  | "UNKNOWN_LICENSE"
  | "CREDIT_MISSING"
  | "LOOP_MISMATCH"
  | "PLAYBACK_UNSUPPORTED"
  | "REJECTED_SKIPPED"
  | "PENDING_CHANGE_REVIEW_ITEMS"
  | "REJECTED_CHANGE_STILL_PRESENT";

export interface ProjectSoundPackIssue {
  severity: SoundBoardValidationSeverity;
  code: ProjectSoundPackIssueCode;
  message: string;
  usageItemId?: string;
  usageKey?: string;
  assetId?: string;
  fileName?: string;
}

export interface ProjectSoundPackCopyFile {
  assetId: string;
  usageItemId: string;
  usageKey: string;
  sourcePath: string;
  outputRelativePath: string;
  originalFileName: string;
  outputFileName: string;
  candidateId: string;
  selected: boolean;
  approved: boolean;
}

export interface ProjectSoundPackPlannedFile {
  type: "manifest" | "doc" | "metadata" | "audio";
  relativePath: string;
  assetId?: string;
}

export interface ProjectSoundPackRenamePlanEntry {
  usageKey: string;
  assetId: string;
  originalFileName: string;
  outputFileName: string;
  outputRelativePath: string;
  renamed: boolean;
  collisionResolved: boolean;
}

export interface ProjectSoundPackSummary {
  requestedUsageItems: number;
  includedUsageItems: number;
  selectedAssetCount: number;
  approvedSelectedCount: number;
  filesToCopy: number;
  skippedMissingFiles: number;
  skippedRejectedCandidates: number;
  selectedButNotApprovedCount: number;
  unknownLicenseCount: number;
  creditRequiredCount: number;
  duplicateOutputFilenameCount: number;
  renameCount: number;
  validationWarningCount: number;
  validationErrorCount: number;
  docsToWrite: number;
  manifestsToWrite: number;
}

export interface ProjectSoundPackUsageManifestItem {
  usageKey: string;
  displayName: string;
  category: SoundUsageCategory;
  required: boolean;
  loopRequired: boolean;
  status: SoundUsageStatus;
  priority: SoundUsagePriority;
  selectedAssets: ProjectSoundPackManifestAsset[];
  candidates: ProjectSoundPackManifestAsset[];
}

export interface ProjectSoundPackManifestAsset {
  assetId: string;
  fileName: string;
  outputFileName: string;
  outputPath: string;
  durationMs: number | null;
  format: string | null;
  loopScore: number | null;
  volumeHint: number;
  selected: boolean;
  approved: boolean;
  rejected: boolean;
  rights?: Pick<
    AssetRightsMetadata,
    "licenseName" | "author" | "attributionText" | "sourceUrl" | "commercialUseStatus" | "creditRequired"
  >;
}

export interface ProjectSoundPackDryRun {
  ok: boolean;
  projectId: string;
  projectName: string;
  engineProfile: ProjectSoundPackEngineProfile;
  outputRoot: string;
  filesToCopy: ProjectSoundPackCopyFile[];
  manifestsToWrite: ProjectSoundPackPlannedFile[];
  docsToWrite: ProjectSoundPackPlannedFile[];
  metadataToWrite: ProjectSoundPackPlannedFile[];
  plannedFiles: ProjectSoundPackPlannedFile[];
  renamePlan: ProjectSoundPackRenamePlanEntry[];
  warnings: ProjectSoundPackIssue[];
  errors: ProjectSoundPackIssue[];
  summary: ProjectSoundPackSummary;
  latestReview?: ProjectSoundPackReviewSummary | null;
  outputTree: string[];
}

export interface ProjectSoundPackExportResult {
  ok: boolean;
  outputPath?: string;
  files: string[];
  summary: ProjectSoundPackSummary;
  warnings: ProjectSoundPackIssue[];
  errors: ProjectSoundPackIssue[];
  partialOutputPath?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface ProjectSoundPackReviewSummary {
  reviewId: string;
  reviewName: string;
  reviewStatus: string;
  pendingChanges: number;
  approvedChanges: number;
  rejectedChanges: number;
  deferredChanges: number;
  rejectedChangesStillPresent: number;
  summary: SoundChangeReviewSummary;
}

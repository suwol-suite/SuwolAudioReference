import type { AssetListItem, BatchResult } from "./library-types";

export type GameEngineType = "generic" | "unity" | "unreal" | "monogame";
export type ProjectDefaultExportFormat =
  | "generic_manifest"
  | "unity_manifest"
  | "unreal_manifest"
  | "monogame_manifest"
  | "codex_instruction"
  | "sound_pack";
export type SoundBoardExportFormat = ProjectDefaultExportFormat | "missing_report";
export type SoundUsageCategory = "ui" | "sfx" | "bgm" | "ambience" | "voice" | "music" | "other";
export type SoundUsageStatus =
  | "missing"
  | "needs_candidates"
  | "reviewing"
  | "selected"
  | "approved"
  | "rejected"
  | "deferred";
export type SoundUsagePriority = "low" | "normal" | "high" | "critical";
export type BuiltInSoundUsageTemplateId =
  | "empty"
  | "basic_mobile_ui"
  | "basic_rpg"
  | "basic_action_game"
  | "basic_casual_game";
export type SoundUsageTemplateId = BuiltInSoundUsageTemplateId | (string & {});
export type SoundUsageRiskFilter =
  | "all"
  | "required"
  | "critical"
  | "loop_required"
  | "recently_updated"
  | "missing_required"
  | "no_candidates"
  | "candidates_no_selected"
  | "selected_not_approved"
  | "approved"
  | "deferred"
  | "rejected"
  | "has_risks"
  | "unknown_license_selected"
  | "loop_mismatch"
  | "playback_unsupported_selected"
  | "missing_file_selected";
export type SoundUsageSortOption =
  | "priority"
  | "status"
  | "category"
  | "candidateCount"
  | "updatedDesc"
  | "updatedWorkflow"
  | "key"
  | "riskCount"
  | "requiredFirst";
export type SoundBoardValidationSeverity = "error" | "warning" | "info";
export type SoundWorkTodoColumn = "missing" | "need_candidates" | "reviewing" | "selected" | "approved" | "deferred" | "risk";
export type SoundWorkTodoSort = "priority" | "status" | "riskCount" | "category" | "updatedWorkflow" | "key";
export type SoundRequestExportFormat = "markdown" | "csv" | "json";
export type SoundRequestDocumentType = "request" | "style_guide" | "checklist";
export type SoundPackSnapshotStatus = "draft" | "approved" | "exported" | "archived";
export type SoundPackDiffSeverity = "info" | "warning" | "breaking";
export type SoundPackDiffChangeType =
  | "usage_added"
  | "usage_removed"
  | "usage_changed"
  | "candidate_added"
  | "candidate_removed"
  | "selection_changed"
  | "approval_changed"
  | "asset_changed"
  | "rights_changed"
  | "risk_changed";
export type SoundPackChangelogFormat = "markdown" | "json" | "csv";

export interface GameProjectRecord {
  id: string;
  libraryId: string;
  name: string;
  description: string;
  engineType: GameEngineType;
  rootNamespace: string;
  defaultExportFormat: ProjectDefaultExportFormat;
  baselineSnapshotId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface GameProjectInput {
  name: string;
  description?: string;
  engineType?: GameEngineType;
  rootNamespace?: string;
  defaultExportFormat?: ProjectDefaultExportFormat;
}

export interface GameProjectUpdateInput {
  name?: string;
  description?: string;
  engineType?: GameEngineType;
  rootNamespace?: string;
  defaultExportFormat?: ProjectDefaultExportFormat;
  baselineSnapshotId?: string | null;
}

export interface SoundUsageItemRecord {
  id: string;
  projectId: string;
  libraryId: string;
  key: string;
  displayName: string;
  category: SoundUsageCategory;
  description: string;
  required: boolean;
  status: SoundUsageStatus;
  priority: SoundUsagePriority;
  loopRequired: boolean;
  variantsAllowed: boolean;
  targetDurationMs: number | null;
  targetLoudnessNote: string;
  notes: string;
  workNote: string;
  assignee: string;
  dueLabel: string;
  reviewNote: string;
  decisionNote: string;
  updatedWorkflowAt: string | null;
  candidateCount: number;
  selectedCandidateCount: number;
  selectedAsset: AssetListItem | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface SoundUsageItemInput {
  projectId: string;
  key: string;
  displayName?: string;
  category?: SoundUsageCategory;
  description?: string;
  required?: boolean;
  status?: SoundUsageStatus;
  priority?: SoundUsagePriority;
  loopRequired?: boolean;
  variantsAllowed?: boolean;
  targetDurationMs?: number | null;
  targetLoudnessNote?: string;
  notes?: string;
  workNote?: string;
  assignee?: string;
  dueLabel?: string;
  reviewNote?: string;
  decisionNote?: string;
}

export interface SoundUsageItemUpdateInput {
  key?: string;
  displayName?: string;
  category?: SoundUsageCategory;
  description?: string;
  required?: boolean;
  status?: SoundUsageStatus;
  priority?: SoundUsagePriority;
  loopRequired?: boolean;
  variantsAllowed?: boolean;
  targetDurationMs?: number | null;
  targetLoudnessNote?: string;
  notes?: string;
  workNote?: string;
  assignee?: string;
  dueLabel?: string;
  reviewNote?: string;
  decisionNote?: string;
  archived?: boolean;
}

export interface SoundUsageListQuery {
  projectId: string;
  search?: string;
  status?: SoundUsageStatus | "all";
  category?: SoundUsageCategory | "all";
  priority?: SoundUsagePriority | "all";
  riskFilter?: SoundUsageRiskFilter;
  sort?: SoundUsageSortOption;
  requiredOnly?: boolean;
  includeArchived?: boolean;
}

export interface SoundUsageCandidateRecord {
  id: string;
  usageItemId: string;
  assetId: string;
  candidateRank: number;
  fitScore: number | null;
  fitReasons: SoundCandidateFitReason[];
  userNote: string;
  pros: string;
  cons: string;
  reviewNote: string;
  decisionReason: string;
  ratingForUsage: number | null;
  loudnessFit: string;
  loopFit: string;
  moodFit: string;
  selected: boolean;
  approved: boolean;
  rejected: boolean;
  asset: AssetListItem | null;
  createdAt: string;
  updatedAt: string;
}

export interface SoundUsageCandidateInput {
  usageItemId: string;
  assetId: string;
  candidateRank?: number;
  fitScore?: number | null;
  fitReasons?: SoundCandidateFitReason[];
  userNote?: string;
  pros?: string;
  cons?: string;
  reviewNote?: string;
  decisionReason?: string;
  ratingForUsage?: number | null;
  loudnessFit?: string;
  loopFit?: string;
  moodFit?: string;
  selected?: boolean;
}

export interface SoundUsageCandidateUpdateInput {
  candidateRank?: number;
  fitScore?: number | null;
  fitReasons?: SoundCandidateFitReason[];
  userNote?: string;
  pros?: string;
  cons?: string;
  reviewNote?: string;
  decisionReason?: string;
  ratingForUsage?: number | null;
  loudnessFit?: string;
  loopFit?: string;
  moodFit?: string;
  selected?: boolean;
  approved?: boolean;
  rejected?: boolean;
}

export interface SoundUsageWorkflowUpdateInput {
  status?: SoundUsageStatus;
  priority?: SoundUsagePriority;
  workNote?: string;
  assignee?: string;
  dueLabel?: string;
  reviewNote?: string;
  decisionNote?: string;
}

export interface SoundCandidateReviewInput {
  userNote?: string;
  pros?: string;
  cons?: string;
  reviewNote?: string;
  decisionReason?: string;
  ratingForUsage?: number | null;
  loudnessFit?: string;
  loopFit?: string;
  moodFit?: string;
  selected?: boolean;
  approved?: boolean;
  rejected?: boolean;
}

export interface SoundWorkTodoQuery {
  projectId: string;
  column?: SoundWorkTodoColumn | "all";
  search?: string;
  assignee?: string;
  dueLabel?: string;
  sort?: SoundWorkTodoSort;
}

export interface SoundWorkTodoItem {
  item: SoundUsageItemRecord;
  column: SoundWorkTodoColumn;
  riskCount: number;
  riskCodes: SoundBoardValidationIssue["code"][];
  selectedAssetName: string;
}

export interface SoundWorkTodoSummary {
  projectId: string;
  total: number;
  risks: number;
  columns: Record<SoundWorkTodoColumn, number>;
}

export interface SoundProjectStyleGuideRecord {
  id: string;
  projectId: string;
  overview: string;
  uiSoundGuide: string;
  sfxGuide: string;
  bgmGuide: string;
  ambienceGuide: string;
  voiceGuide: string;
  loudnessGuide: string;
  loopGuide: string;
  namingGuide: string;
  licenseGuide: string;
  exportGuide: string;
  createdAt: string;
  updatedAt: string;
}

export type SoundProjectStyleGuideInput = Partial<
  Pick<
    SoundProjectStyleGuideRecord,
    | "overview"
    | "uiSoundGuide"
    | "sfxGuide"
    | "bgmGuide"
    | "ambienceGuide"
    | "voiceGuide"
    | "loudnessGuide"
    | "loopGuide"
    | "namingGuide"
    | "licenseGuide"
    | "exportGuide"
  >
>;

export interface SoundProjectChecklistItemRecord {
  id: string;
  projectId: string;
  label: string;
  checked: boolean;
  note: string;
  sortOrder: number;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SoundProjectChecklistItemInput {
  projectId: string;
  label: string;
  note?: string;
  sortOrder?: number;
}

export interface SoundProjectChecklistItemUpdateInput {
  checked?: boolean;
  note?: string;
  label?: string;
  sortOrder?: number;
}

export interface SoundProjectChecklistListResult {
  projectId: string;
  builtInLabels: string[];
  items: SoundProjectChecklistItemRecord[];
}

export interface SoundCandidateFitReason {
  code:
    | "similar_audio"
    | "category_match"
    | "tag_match"
    | "duration_match"
    | "loop_match"
    | "rating_bonus"
    | "favorite_bonus"
    | "playable"
    | "missing_file"
    | "unknown";
  message: string;
  score: number;
}

export interface SoundCandidateSuggestion {
  asset: AssetListItem;
  score: number;
  reasons: SoundCandidateFitReason[];
  source: "similarity" | "library";
}

export interface SoundCandidateSuggestInput {
  usageItemId: string;
  seedAssetId?: string;
  limit?: number;
}

export interface SoundBoardSummary {
  projectId: string;
  total: number;
  required: number;
  missing: number;
  needsCandidates: number;
  reviewing: number;
  selected: number;
  approved: number;
  rejected: number;
  deferred: number;
  requiredMissing: number;
  noCandidates: number;
  candidatesWithoutSelected?: number;
  selectedNotApproved?: number;
  unknownLicenseSelected?: number;
  loopWarnings?: number;
  playbackUnsupportedSelected?: number;
  missingFileSelected?: number;
  riskCount?: number;
}

export interface MissingSoundReport {
  project: GameProjectRecord;
  summary: SoundBoardSummary;
  requiredMissing: SoundUsageItemRecord[];
  noCandidates: SoundUsageItemRecord[];
  candidatesWithoutSelected: SoundUsageItemRecord[];
  rejectedOnly: SoundUsageItemRecord[];
  loopWarnings: SoundUsageItemRecord[];
  unknownLicenseSelected: SoundUsageCandidateRecord[];
}

export interface SoundUsageTemplate {
  id: string;
  name: string;
  description?: string;
  engineType?: GameEngineType;
  builtIn?: boolean;
  createdAt?: string;
  updatedAt?: string;
  items: Omit<SoundUsageItemInput, "projectId">[];
}

export interface SoundUsageCustomTemplateInput {
  projectId: string;
  name: string;
  description?: string;
}

export interface SoundUsageTemplateApplyInput {
  projectId: string;
  templateId: string;
  conflictMode?: "skip" | "update";
}

export interface SoundUsageTemplateApplyPreview {
  template: SoundUsageTemplate;
  projectId: string;
  createCount: number;
  updateCount: number;
  skipCount: number;
  rows: SoundUsageBulkPreviewRow[];
  warnings: string[];
}

export interface SoundUsageBulkPreviewInput {
  projectId: string;
  text: string;
  conflictMode?: "skip" | "update";
}

export interface SoundUsageBulkCreateInput extends SoundUsageBulkPreviewInput {
  confirmed?: boolean;
}

export interface SoundUsageBulkPreviewRow {
  lineNumber: number;
  raw: string;
  key: string;
  suggestedKey: string;
  displayName: string;
  category: SoundUsageCategory;
  priority: SoundUsagePriority;
  loopRequired: boolean;
  valid: boolean;
  exists: boolean;
  action: "create" | "update" | "skip";
  warnings: string[];
}

export interface SoundUsageBulkPreview {
  projectId: string;
  validCount: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  alreadyExistsCount: number;
  duplicateCount: number;
  invalidCount: number;
  unknownCategoryCount: number;
  unknownPriorityCount: number;
  loopDetectedCount: number;
  blankLineCount: number;
  commentLineCount: number;
  rows: SoundUsageBulkPreviewRow[];
  warnings: string[];
}

export interface SoundBoardDashboard {
  projectId: string;
  total: number;
  required: number;
  missing: number;
  needsReview: number;
  selected: number;
  approved: number;
  rejected: number;
  deferred: number;
  noCandidates: number;
  risks: number;
  unknownLicenseSelected: number;
  loopWarnings: number;
  playbackUnsupportedSelected: number;
  missingFileSelected: number;
}

export interface SoundBoardValidationIssue {
  id: string;
  severity: SoundBoardValidationSeverity;
  code:
    | "KEY_EMPTY"
    | "KEY_INVALID"
    | "DUPLICATE_KEY"
    | "REQUIRED_MISSING"
    | "NO_SELECTED_ASSET"
    | "SELECTED_MISSING_FILE"
    | "SELECTED_PLAYBACK_UNSUPPORTED"
    | "LOOP_MISMATCH"
    | "UNKNOWN_LICENSE"
    | "CREDIT_MISSING"
    | "SELECTED_ASSET_TRASHED"
    | "SELECTED_CANDIDATE_REJECTED"
    | "ENGINE_KEY_WARNING"
    | "APPROVED_DECISION_NOTE_MISSING"
    | "SELECTED_REVIEW_NOTE_MISSING"
    | "WORK_NOTE_OPEN"
    | "STYLE_GUIDE_EMPTY"
    | "CHECKLIST_INCOMPLETE"
    | "CANDIDATE_REVIEW_MISSING";
  message: string;
  usageItemId?: string;
  usageKey?: string;
  assetId?: string;
  suggestedKey?: string;
}

export interface SoundBoardValidationResult {
  projectId: string;
  ok: boolean;
  dashboard: SoundBoardDashboard;
  issues: SoundBoardValidationIssue[];
}

export interface SoundUsageAssetLink {
  projectId: string;
  projectName: string;
  usageItemId: string;
  usageKey: string;
  displayName: string;
  category: SoundUsageCategory;
  status: SoundUsageStatus;
  candidateId: string;
  selected: boolean;
  approved: boolean;
  rejected: boolean;
}

export interface SoundBoardExportOptions {
  projectId: string;
  format?: SoundBoardExportFormat;
  usageItemIds?: string[];
  includeCandidates?: boolean;
  includeRejectedCandidates?: boolean;
  includeMissingItems?: boolean;
  includeUsageNotes?: boolean;
  includeRights?: boolean;
  includeAbsolutePaths?: boolean;
  includeBoardSummary?: boolean;
  includeValidationReport?: boolean;
  includeStyleGuide?: boolean;
  includeChecklist?: boolean;
  includeWorkNotes?: boolean;
  includeReviewNotes?: boolean;
  includeCandidateReviewNotes?: boolean;
  includeDecisionNotes?: boolean;
  selectedOnly?: boolean;
  copySelectedAudioFiles?: boolean;
  copyCandidates?: boolean;
}

export interface SoundBoardExportPreview {
  ok: boolean;
  projectId: string;
  format: SoundBoardExportFormat;
  itemCount: number;
  selectedCount: number;
  candidateCount?: number;
  missingCount: number;
  requiredMissingCount?: number;
  warningCount?: number;
  errorCount?: number;
  unknownLicenseCount?: number;
  engineKeyWarningCount?: number;
  copiedFileCount?: number;
  skippedFileCount?: number;
  plannedFiles: { path: string; kind: "manifest" | "markdown" | "csv" | "metadata" | "report" }[];
  warnings: string[];
  validationIssues?: SoundBoardValidationIssue[];
  previewText?: string;
}

export interface SoundBoardExportResult {
  ok: boolean;
  outputPath?: string;
  files: string[];
  summary: BatchResult;
  error?: { code: string; message: string };
}

export interface SoundRequestExportOptions {
  projectId: string;
  format?: SoundRequestExportFormat;
  documentType?: SoundRequestDocumentType;
  usageItemIds?: string[];
  includeMissingItems?: boolean;
  includeCandidates?: boolean;
  includeRejectedCandidates?: boolean;
  includeStyleGuide?: boolean;
  includeChecklist?: boolean;
  includeWorkNotes?: boolean;
  includeReviewNotes?: boolean;
  includeCandidateReviewNotes?: boolean;
  includeDecisionNotes?: boolean;
  includeAbsolutePaths?: boolean;
  includeRights?: boolean;
}

export interface SoundRequestExportPreview {
  ok: boolean;
  projectId: string;
  format: SoundRequestExportFormat;
  itemCount: number;
  candidateCount: number;
  warningCount: number;
  errorCount: number;
  plannedFiles: { path: string; kind: "markdown" | "csv" | "json" }[];
  warnings: string[];
  validationIssues?: SoundBoardValidationIssue[];
  previewText?: string;
}

export interface SoundRequestExportResult {
  ok: boolean;
  outputPath?: string;
  files: string[];
  summary: BatchResult;
  error?: { code: string; message: string };
}

export interface SoundPackSnapshotValidationSummary {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  riskCount: number;
}

export interface SoundPackSnapshotItemRecord {
  id: string;
  snapshotId: string;
  usageItemId: string;
  usageKey: string;
  displayName: string;
  category: SoundUsageCategory;
  status: SoundUsageStatus;
  priority: SoundUsagePriority;
  required: boolean;
  loopRequired: boolean;
  variantsAllowed: boolean;
  selectedAssetIds: string[];
  approvedAssetIds: string[];
  candidateAssetIds: string[];
  snapshotJson: SoundPackSnapshotItemPayload;
  createdAt: string;
}

export interface SoundPackSnapshotItemPayload {
  usageItem: SoundUsageItemRecord;
  candidates: SoundUsageCandidateRecord[];
  rightsByAssetId: Record<string, SoundPackSnapshotAssetRights>;
}

export interface SoundPackSnapshotAssetRights {
  licenseName: string;
  commercialUseStatus: string;
  creditRequired: string;
  attributionText: string;
  sourceUrl: string;
}

export interface SoundPackSnapshotPayload {
  version: 1;
  project: GameProjectRecord;
  summary: SoundBoardSummary;
  validation: SoundBoardValidationResult;
  items: SoundPackSnapshotItemPayload[];
  exportOptions?: Record<string, unknown>;
}

export interface SoundPackSnapshotRecord {
  id: string;
  libraryId: string;
  projectId: string;
  name: string;
  description: string;
  status: SoundPackSnapshotStatus;
  frozen: boolean;
  itemCount: number;
  selectedCount: number;
  approvedCount: number;
  missingCount: number;
  warningCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  exportHistoryId: string | null;
  payload: SoundPackSnapshotPayload;
}

export interface SoundPackSnapshotDetail extends SoundPackSnapshotRecord {
  items: SoundPackSnapshotItemRecord[];
}

export interface SoundPackSnapshotInput {
  projectId: string;
  name?: string;
  description?: string;
  status?: SoundPackSnapshotStatus;
  freeze?: boolean;
  exportHistoryId?: string | null;
  exportOptions?: Record<string, unknown>;
}

export interface SoundPackDiffChange {
  id: string;
  type: SoundPackDiffChangeType;
  severity: SoundPackDiffSeverity;
  usageKey: string;
  usageItemId?: string;
  assetId?: string;
  candidateId?: string;
  field?: string;
  before?: unknown;
  after?: unknown;
  message: string;
}

export interface SoundPackDiffSummary {
  addedUsageItems: number;
  removedUsageItems: number;
  changedUsageItems: number;
  selectionChanges: number;
  approvalChanges: number;
  candidateChanges: number;
  assetChanges: number;
  rightsChanges: number;
  riskChanges: number;
  breakingChanges: number;
  warnings: number;
}

export interface SoundPackCompareInput {
  projectId?: string;
  fromSnapshotId: string;
  toSnapshotId?: string;
  compareToCurrent?: boolean;
}

export interface SoundPackDiffResult {
  projectId: string;
  fromSnapshotId: string;
  toSnapshotId: string | null;
  toCurrent: boolean;
  fromName: string;
  toName: string;
  summary: SoundPackDiffSummary;
  changes: SoundPackDiffChange[];
}

export interface SoundPackRollbackPreview {
  snapshotId: string;
  projectId: string;
  snapshotName: string;
  canApply: boolean;
  selectedChanges: number;
  approvedChanges: number;
  skippedMissingUsageItems: number;
  skippedMissingCandidates: number;
  warnings: string[];
  changes: SoundPackDiffChange[];
}

export interface SoundPackRollbackApplyInput {
  snapshotId: string;
  confirmed?: boolean;
}

export interface SoundPackRollbackResult extends SoundPackRollbackPreview {
  applied: boolean;
  updatedUsageItems: number;
  updatedCandidates: number;
}

export interface SoundPackChangelogOptions extends SoundPackCompareInput {
  format?: SoundPackChangelogFormat;
  includeDiffSummary?: boolean;
  includeCandidateChanges?: boolean;
  includeRightsChanges?: boolean;
  includeRiskChanges?: boolean;
}

export interface SoundPackChangelogPreview {
  projectId: string;
  format: SoundPackChangelogFormat;
  fileName: string;
  diff: SoundPackDiffResult;
  previewText: string;
}

export interface SoundPackChangelogResult extends SoundPackChangelogPreview {
  ok: boolean;
  outputPath?: string;
  files: string[];
  error?: { code: string; message: string };
}

import { randomUUID } from "node:crypto";
import type {
  SoundBoardDashboard,
  SoundBoardValidationIssue,
  SoundBoardValidationResult,
  SoundUsageAssetLink,
  SoundUsageItemRecord,
  SoundUsageStatus,
} from "../../shared/sound-board-types";
import type { AssetService } from "./asset-service";
import { sanitizeEngineKey } from "./game-audio-manifest-service";
import type { LibraryService } from "./library-service";
import { isValidUsageKey, sanitizeUsageKey } from "./sound-board-helpers";
import { SoundChecklistService } from "./sound-checklist-service";
import { SoundCandidateService } from "./sound-candidate-service";
import { SoundStyleGuideService } from "./sound-style-guide-service";
import { SoundUsageService } from "./sound-usage-service";

interface RightsRow {
  asset_id: string;
  license_name: string;
  commercial_use_status: string;
  credit_required: string;
  attribution_text: string;
}

interface AssetLinkRow {
  project_id: string;
  project_name: string;
  usage_item_id: string;
  usage_key: string;
  display_name: string;
  category: string;
  status: SoundUsageStatus;
  candidate_id: string;
  selected: number;
  approved: number;
  rejected: number;
}

export class SoundBoardValidationService {
  private readonly usageService: SoundUsageService;
  private readonly styleGuideService: SoundStyleGuideService;
  private readonly checklistService: SoundChecklistService;

  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly candidateService: SoundCandidateService,
  ) {
    this.usageService = new SoundUsageService(libraryService, assetService);
    this.styleGuideService = new SoundStyleGuideService(libraryService);
    this.checklistService = new SoundChecklistService(libraryService);
  }

  async validateBoard(projectId: string): Promise<SoundBoardValidationResult> {
    const items = await this.usageService.listItems({ projectId });
    const issues: SoundBoardValidationIssue[] = [];
    const keyCounts = new Map<string, number>();
    for (const item of items) {
      keyCounts.set(item.key, (keyCounts.get(item.key) ?? 0) + 1);
      issues.push(...(await this.validateItem(item)));
    }
    for (const item of items) {
      if ((keyCounts.get(item.key) ?? 0) > 1) {
        issues.push(createIssue("error", "DUPLICATE_KEY", `Duplicate usage key: ${item.key}`, item));
      }
    }
    if (this.styleGuideService.isEmpty(projectId)) {
      issues.push(createBoardIssue("warning", "STYLE_GUIDE_EMPTY", "Project sound style guide is empty."));
    }
    if (this.checklistService.isIncomplete(projectId)) {
      issues.push(createBoardIssue("warning", "CHECKLIST_INCOMPLETE", "Project checklist is incomplete."));
    }
    const dashboard = this.createDashboard(projectId, items, issues);
    return {
      projectId,
      ok: issues.every((issue) => issue.severity !== "error"),
      dashboard,
      issues,
    };
  }

  async getAssetLinks(assetId: string): Promise<SoundUsageAssetLink[]> {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<AssetLinkRow>(
      `
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        i.id AS usage_item_id,
        i.key AS usage_key,
        i.display_name,
        i.category,
        i.status,
        c.id AS candidate_id,
        c.selected,
        c.approved,
        c.rejected
      FROM sound_usage_candidates c
      JOIN sound_usage_items i ON i.id = c.usage_item_id
      JOIN game_projects p ON p.id = i.project_id
      WHERE c.asset_id = ?
        AND i.library_id = ?
        AND i.archived_at IS NULL
        AND p.archived_at IS NULL
      ORDER BY c.selected DESC, p.updated_at DESC, i.key COLLATE NOCASE
      `,
      [assetId, context.library.id],
    );
    return rows.map((row) => ({
      projectId: row.project_id,
      projectName: row.project_name,
      usageItemId: row.usage_item_id,
      usageKey: row.usage_key,
      displayName: row.display_name,
      category: row.category as SoundUsageAssetLink["category"],
      status: row.status,
      candidateId: row.candidate_id,
      selected: row.selected === 1,
      approved: row.approved === 1,
      rejected: row.rejected === 1,
    }));
  }

  private async validateItem(item: SoundUsageItemRecord): Promise<SoundBoardValidationIssue[]> {
    const issues: SoundBoardValidationIssue[] = [];
    if (!item.key.trim()) {
      issues.push(createIssue("error", "KEY_EMPTY", "Usage key is empty.", item));
    }
    const suggestedKey = sanitizeUsageKey(item.key);
    if (!isValidUsageKey(item.key) || suggestedKey !== item.key) {
      issues.push(createIssue("warning", "KEY_INVALID", `Usage key can be normalized to ${suggestedKey}.`, item, { suggestedKey }));
    }
    const engineKey = sanitizeEngineKey(item.key);
    if (engineKey !== item.key.replace(/[.:-]+/g, "_")) {
      issues.push(createIssue("warning", "ENGINE_KEY_WARNING", `Engine key will be sanitized to ${engineKey}.`, item, { suggestedKey: engineKey }));
    }
    const candidates = await this.candidateService.listCandidates(item.id);
    const selected = candidates.filter((candidate) => candidate.selected);
    if (item.status === "approved" && !item.decisionNote.trim()) {
      issues.push(createIssue("warning", "APPROVED_DECISION_NOTE_MISSING", "Approved usage item has no decision note.", item));
    }
    if (selected.length > 0 && !item.reviewNote.trim()) {
      issues.push(createIssue("warning", "SELECTED_REVIEW_NOTE_MISSING", "Selected usage item has no review note.", item));
    }
    if (/\bTODO\b/i.test(item.workNote)) {
      issues.push(createIssue("warning", "WORK_NOTE_OPEN", "Work note still contains TODO.", item));
    }
    if (item.required && selected.length === 0) {
      issues.push(createIssue("error", "REQUIRED_MISSING", "Required usage item has no selected asset.", item));
    } else if (selected.length === 0 && candidates.length > 0) {
      issues.push(createIssue("warning", "NO_SELECTED_ASSET", "Candidates exist but no asset is selected.", item));
    }
    const rightsByAssetId = this.loadRights(selected.map((candidate) => candidate.assetId));
    for (const candidate of selected) {
      if (candidate.ratingForUsage === null && !candidate.reviewNote.trim()) {
        issues.push(createIssue("warning", "CANDIDATE_REVIEW_MISSING", "Selected candidate has no usage rating or review note.", item, { assetId: candidate.assetId }));
      }
      const asset = candidate.asset ?? (await this.assetService.getAsset(candidate.assetId));
      if (candidate.rejected) {
        issues.push(createIssue("error", "SELECTED_CANDIDATE_REJECTED", "Selected candidate is also rejected.", item, { assetId: candidate.assetId }));
      }
      if (!asset) {
        issues.push(createIssue("error", "SELECTED_MISSING_FILE", "Selected asset record is missing.", item, { assetId: candidate.assetId }));
        continue;
      }
      if (asset.trashedAt) {
        issues.push(createIssue("error", "SELECTED_ASSET_TRASHED", "Selected asset is in trash.", item, { assetId: asset.id }));
      }
      if (asset.fileMissing) {
        issues.push(createIssue("error", "SELECTED_MISSING_FILE", "Selected asset file is missing.", item, { assetId: asset.id }));
      }
      if (!asset.playable) {
        issues.push(createIssue("warning", "SELECTED_PLAYBACK_UNSUPPORTED", "Selected asset is not playable.", item, { assetId: asset.id }));
      }
      if (item.loopRequired && asset.audioAnalysis?.loopLikelihood !== "high" && (asset.audioAnalysis?.loopScore ?? 0) < 0.72) {
        issues.push(createIssue("warning", "LOOP_MISMATCH", "Loop-required item has a low loop score.", item, { assetId: asset.id }));
      }
      const rights = rightsByAssetId.get(asset.id);
      if (!rights || !rights.license_name || rights.commercial_use_status === "unknown") {
        issues.push(createIssue("warning", "UNKNOWN_LICENSE", "Selected asset has unknown license metadata.", item, { assetId: asset.id }));
      }
      if (rights?.credit_required === "yes" && !rights.attribution_text.trim()) {
        issues.push(createIssue("warning", "CREDIT_MISSING", "Selected asset requires credit but attribution is empty.", item, { assetId: asset.id }));
      }
    }
    return issues;
  }

  private createDashboard(
    projectId: string,
    items: SoundUsageItemRecord[],
    issues: SoundBoardValidationIssue[],
  ): SoundBoardDashboard {
    const issueItems = new Set(issues.map((issue) => issue.usageItemId).filter(Boolean));
    return {
      projectId,
      total: items.length,
      required: items.filter((item) => item.required).length,
      missing: items.filter((item) => item.status === "missing" || (item.required && item.selectedCandidateCount === 0)).length,
      needsReview: items.filter((item) => item.status === "reviewing" || item.status === "needs_candidates").length,
      selected: items.filter((item) => item.status === "selected").length,
      approved: items.filter((item) => item.status === "approved").length,
      rejected: items.filter((item) => item.status === "rejected").length,
      deferred: items.filter((item) => item.status === "deferred").length,
      noCandidates: items.filter((item) => item.candidateCount === 0).length,
      risks: issueItems.size,
      unknownLicenseSelected: issues.filter((issue) => issue.code === "UNKNOWN_LICENSE").length,
      loopWarnings: issues.filter((issue) => issue.code === "LOOP_MISMATCH").length,
      playbackUnsupportedSelected: issues.filter((issue) => issue.code === "SELECTED_PLAYBACK_UNSUPPORTED").length,
      missingFileSelected: issues.filter((issue) => issue.code === "SELECTED_MISSING_FILE").length,
    };
  }

  private loadRights(assetIds: string[]): Map<string, RightsRow> {
    if (assetIds.length === 0) {
      return new Map();
    }
    const context = this.libraryService.requireActive();
    const placeholders = assetIds.map(() => "?").join(", ");
    const rows = context.db.all<RightsRow>(
      `SELECT asset_id, license_name, commercial_use_status, credit_required, attribution_text
       FROM asset_rights_metadata
       WHERE asset_id IN (${placeholders})`,
      assetIds,
    );
    return new Map(rows.map((row) => [row.asset_id, row]));
  }
}

function createIssue(
  severity: SoundBoardValidationIssue["severity"],
  code: SoundBoardValidationIssue["code"],
  message: string,
  item: SoundUsageItemRecord,
  extra: Partial<SoundBoardValidationIssue> = {},
): SoundBoardValidationIssue {
  return {
    id: randomUUID(),
    severity,
    code,
    message,
    usageItemId: item.id,
    usageKey: item.key,
    ...extra,
  };
}

function createBoardIssue(
  severity: SoundBoardValidationIssue["severity"],
  code: SoundBoardValidationIssue["code"],
  message: string,
): SoundBoardValidationIssue {
  return {
    id: randomUUID(),
    severity,
    code,
    message,
  };
}

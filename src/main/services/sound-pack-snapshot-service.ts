import { randomUUID } from "node:crypto";
import type { BatchResult } from "../../shared/library-types";
import type {
  GameProjectRecord,
  SoundPackRollbackApplyInput,
  SoundPackRollbackPreview,
  SoundPackRollbackResult,
  SoundPackSnapshotDetail,
  SoundPackSnapshotInput,
  SoundPackSnapshotItemPayload,
  SoundPackSnapshotItemRecord,
  SoundPackSnapshotPayload,
  SoundPackSnapshotRecord,
  SoundPackSnapshotStatus,
  SoundUsageCandidateRecord,
  SoundUsageItemRecord,
  SoundUsageStatus,
} from "../../shared/sound-board-types";
import type { AssetService } from "./asset-service";
import { createBatchResult, recordSkipped, recordSuccess } from "./batch-result";
import type { GameProjectService } from "./game-project-service";
import type { LibraryService } from "./library-service";
import type { SoundBoardValidationService } from "./sound-board-validation-service";
import type { SoundCandidateService } from "./sound-candidate-service";
import { intToBool, normalizeOptionalText } from "./sound-board-helpers";
import { SoundUsageService } from "./sound-usage-service";

interface SnapshotRow {
  id: string;
  library_id: string;
  project_id: string;
  name: string;
  description: string;
  status: SoundPackSnapshotStatus;
  frozen: number;
  item_count: number;
  selected_count: number;
  approved_count: number;
  missing_count: number;
  warning_count: number;
  error_count: number;
  snapshot_json: string;
  created_by: string;
  export_history_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SnapshotItemRow {
  id: string;
  snapshot_id: string;
  usage_item_id: string;
  usage_key: string;
  display_name: string;
  category: SoundPackSnapshotItemRecord["category"];
  status: SoundPackSnapshotItemRecord["status"];
  priority: SoundPackSnapshotItemRecord["priority"];
  required: number;
  loop_required: number;
  variants_allowed: number;
  selected_asset_ids_json: string;
  approved_asset_ids_json: string;
  candidate_asset_ids_json: string;
  item_json: string;
  created_at: string;
}

interface CandidateFlagRow {
  id: string;
  usage_item_id: string;
  asset_id: string;
  selected: number;
  approved: number;
  rejected: number;
}

interface RightsSnapshotRow {
  asset_id: string;
  license_name: string;
  commercial_use_status: string;
  credit_required: string;
  attribution_text: string;
  source_url: string;
}

export class SoundPackSnapshotService {
  private readonly usageService: SoundUsageService;

  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly candidateService: SoundCandidateService,
    private readonly validationService: SoundBoardValidationService,
    private readonly projectService: GameProjectService,
  ) {
    this.usageService = new SoundUsageService(libraryService, assetService);
  }

  async list(projectId: string): Promise<SoundPackSnapshotRecord[]> {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<SnapshotRow>(
      `
      SELECT *
      FROM sound_pack_snapshots
      WHERE library_id = ? AND project_id = ?
      ORDER BY created_at DESC
      `,
      [context.library.id, projectId],
    );
    return rows.map(mapSnapshotRow);
  }

  async create(input: SoundPackSnapshotInput): Promise<SoundPackSnapshotDetail> {
    const context = this.libraryService.requireActive();
    const payload = await this.createPayload(input.projectId, input.exportOptions);
    const now = new Date().toISOString();
    const id = randomUUID();
    const name = input.name?.trim() || `${payload.project.name} Snapshot ${formatSnapshotTimestamp(now)}`;
    const status = input.status ?? (input.freeze ? "approved" : "draft");
    const counts = countSnapshot(payload);
    const itemPayloads = payload.items.map((item) => ({
      id: randomUUID(),
      snapshotId: id,
      payload: item,
      selectedAssetIds: selectedAssetIds(item),
      approvedAssetIds: approvedAssetIds(item),
      candidateAssetIds: item.candidates.map((candidate) => candidate.assetId),
    }));

    context.db.transaction(() => {
      context.db.run(
        `
        INSERT INTO sound_pack_snapshots (
          id, library_id, project_id, name, description, status, frozen,
          item_count, selected_count, approved_count, missing_count, warning_count, error_count,
          snapshot_json, created_by, export_history_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          context.library.id,
          input.projectId,
          name,
          normalizeOptionalText(input.description),
          status,
          input.freeze ? 1 : 0,
          counts.itemCount,
          counts.selectedCount,
          counts.approvedCount,
          counts.missingCount,
          counts.warningCount,
          counts.errorCount,
          JSON.stringify(payload),
          "local",
          input.exportHistoryId ?? null,
          now,
          now,
        ],
      );

      for (const item of itemPayloads) {
        context.db.run(
          `
          INSERT INTO sound_pack_snapshot_items (
            id, snapshot_id, usage_item_id, usage_key, display_name, category, status, priority,
            required, loop_required, variants_allowed, selected_asset_ids_json, approved_asset_ids_json,
            candidate_asset_ids_json, item_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            item.id,
            item.snapshotId,
            item.payload.usageItem.id,
            item.payload.usageItem.key,
            item.payload.usageItem.displayName,
            item.payload.usageItem.category,
            item.payload.usageItem.status,
            item.payload.usageItem.priority,
            item.payload.usageItem.required ? 1 : 0,
            item.payload.usageItem.loopRequired ? 1 : 0,
            item.payload.usageItem.variantsAllowed ? 1 : 0,
            JSON.stringify(item.selectedAssetIds),
            JSON.stringify(item.approvedAssetIds),
            JSON.stringify(item.candidateAssetIds),
            JSON.stringify(item.payload),
            now,
          ],
        );
      }
    });

    const created = await this.get(id);
    if (!created) {
      throw new Error("SNAPSHOT_CREATE_FAILED");
    }
    return created;
  }

  async get(snapshotId: string): Promise<SoundPackSnapshotDetail | null> {
    const context = this.libraryService.requireActive();
    const row = context.db.get<SnapshotRow>("SELECT * FROM sound_pack_snapshots WHERE id = ? AND library_id = ?", [
      snapshotId,
      context.library.id,
    ]);
    if (!row) {
      return null;
    }
    return { ...mapSnapshotRow(row), items: this.listItems(snapshotId) };
  }

  async createCurrent(projectId: string): Promise<SoundPackSnapshotDetail> {
    const payload = await this.createPayload(projectId);
    const now = new Date().toISOString();
    const counts = countSnapshot(payload);
    return {
      id: "current",
      libraryId: payload.project.libraryId,
      projectId,
      name: "Current board",
      description: "",
      status: "draft",
      frozen: false,
      itemCount: counts.itemCount,
      selectedCount: counts.selectedCount,
      approvedCount: counts.approvedCount,
      missingCount: counts.missingCount,
      warningCount: counts.warningCount,
      errorCount: counts.errorCount,
      createdAt: now,
      updatedAt: now,
      createdBy: "local",
      exportHistoryId: null,
      payload,
      items: payload.items.map((item) => mapPayloadToTransientItem(item, now)),
    };
  }

  delete(snapshotId: string): BatchResult {
    const context = this.libraryService.requireActive();
    const row = context.db.get<SnapshotRow>("SELECT * FROM sound_pack_snapshots WHERE id = ? AND library_id = ?", [
      snapshotId,
      context.library.id,
    ]);
    const result = createBatchResult(1);
    if (!row) {
      recordSkipped(result, "Snapshot was already removed.");
      return result;
    }
    if (row.frozen === 1) {
      throw new Error("SNAPSHOT_FROZEN");
    }
    context.db.run("DELETE FROM sound_pack_snapshots WHERE id = ? AND library_id = ?", [snapshotId, context.library.id]);
    recordSuccess(result);
    return result;
  }

  async freeze(snapshotId: string): Promise<SoundPackSnapshotDetail> {
    const context = this.libraryService.requireActive();
    const now = new Date().toISOString();
    context.db.run(
      `
      UPDATE sound_pack_snapshots
      SET frozen = 1,
          status = CASE WHEN status = 'draft' THEN 'approved' ELSE status END,
          updated_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [now, snapshotId, context.library.id],
    );
    const frozen = await this.get(snapshotId);
    if (!frozen) {
      throw new Error("SNAPSHOT_NOT_FOUND");
    }
    return frozen;
  }

  async setBaseline(snapshotId: string): Promise<GameProjectRecord> {
    const snapshot = await this.get(snapshotId);
    if (!snapshot) {
      throw new Error("SNAPSHOT_NOT_FOUND");
    }
    return this.projectService.updateProject(snapshot.projectId, { baselineSnapshotId: snapshot.id });
  }

  async rollbackPreview(snapshotId: string): Promise<SoundPackRollbackPreview> {
    const snapshot = await this.get(snapshotId);
    if (!snapshot) {
      throw new Error("SNAPSHOT_NOT_FOUND");
    }
    const currentItems = await this.usageService.listItems({ projectId: snapshot.projectId });
    const currentByKey = new Map(currentItems.map((item) => [item.key, item]));
    const changes = [];
    const warnings: string[] = [];
    let selectedChanges = 0;
    let approvedChanges = 0;
    let skippedMissingUsageItems = 0;
    let skippedMissingCandidates = 0;

    for (const snapshotItem of snapshot.items) {
      const current = currentByKey.get(snapshotItem.usageKey);
      if (!current) {
        skippedMissingUsageItems += 1;
        warnings.push(`Usage item no longer exists: ${snapshotItem.usageKey}`);
        continue;
      }
      const currentCandidates = await this.candidateService.listCandidates(current.id);
      const currentCandidateAssetIds = new Set(currentCandidates.map((candidate) => candidate.assetId));
      const availableSelected = snapshotItem.selectedAssetIds.filter((assetId) => currentCandidateAssetIds.has(assetId));
      const availableApproved = snapshotItem.approvedAssetIds.filter((assetId) => currentCandidateAssetIds.has(assetId));
      skippedMissingCandidates += snapshotItem.selectedAssetIds.length - availableSelected.length;
      skippedMissingCandidates += snapshotItem.approvedAssetIds.filter((assetId) => !currentCandidateAssetIds.has(assetId)).length;
      const currentSelected = currentCandidates.filter((candidate) => candidate.selected).map((candidate) => candidate.assetId);
      const currentApproved = currentCandidates.filter((candidate) => candidate.approved).map((candidate) => candidate.assetId);
      if (!sameSet(currentSelected, availableSelected)) {
        selectedChanges += 1;
        changes.push({
          id: randomUUID(),
          type: "selection_changed" as const,
          severity: "warning" as const,
          usageKey: snapshotItem.usageKey,
          usageItemId: current.id,
          field: "selectedAssetIds",
          before: currentSelected,
          after: availableSelected,
          message: `${snapshotItem.usageKey}: selected assets will be restored.`,
        });
      }
      if (!sameSet(currentApproved, availableApproved)) {
        approvedChanges += 1;
        changes.push({
          id: randomUUID(),
          type: "approval_changed" as const,
          severity: "warning" as const,
          usageKey: snapshotItem.usageKey,
          usageItemId: current.id,
          field: "approvedAssetIds",
          before: currentApproved,
          after: availableApproved,
          message: `${snapshotItem.usageKey}: approved assets will be restored.`,
        });
      }
    }

    if (skippedMissingCandidates > 0) {
      warnings.push(`${skippedMissingCandidates} selected or approved candidates are missing from the current board.`);
    }

    return {
      snapshotId: snapshot.id,
      projectId: snapshot.projectId,
      snapshotName: snapshot.name,
      canApply: changes.length > 0 && skippedMissingUsageItems < snapshot.items.length,
      selectedChanges,
      approvedChanges,
      skippedMissingUsageItems,
      skippedMissingCandidates,
      warnings,
      changes,
    };
  }

  async rollbackApply(input: SoundPackRollbackApplyInput): Promise<SoundPackRollbackResult> {
    if (!input.confirmed) {
      throw new Error("SNAPSHOT_ROLLBACK_CONFIRMATION_REQUIRED");
    }
    const snapshot = await this.get(input.snapshotId);
    if (!snapshot) {
      throw new Error("SNAPSHOT_NOT_FOUND");
    }
    const preview = await this.rollbackPreview(input.snapshotId);
    const context = this.libraryService.requireActive();
    const currentItems = await this.usageService.listItems({ projectId: snapshot.projectId });
    const currentByKey = new Map(currentItems.map((item) => [item.key, item]));
    let updatedUsageItems = 0;
    let updatedCandidates = 0;

    context.db.transaction(() => {
      const now = new Date().toISOString();
      for (const snapshotItem of snapshot.items) {
        const current = currentByKey.get(snapshotItem.usageKey);
        if (!current) {
          continue;
        }
        const rows = context.db.all<CandidateFlagRow>("SELECT * FROM sound_usage_candidates WHERE usage_item_id = ?", [
          current.id,
        ]);
        const selectedTargets = new Set(snapshotItem.selectedAssetIds);
        const approvedTargets = new Set(snapshotItem.approvedAssetIds);
        let changedCandidateForItem = false;
        for (const row of rows) {
          const selected = selectedTargets.has(row.asset_id);
          const approved = selected && approvedTargets.has(row.asset_id);
          const rejected = selected ? 0 : row.rejected;
          if (row.selected !== (selected ? 1 : 0) || row.approved !== (approved ? 1 : 0) || row.rejected !== rejected) {
            context.db.run(
              `
              UPDATE sound_usage_candidates
              SET selected = ?,
                  approved = ?,
                  rejected = ?,
                  updated_at = ?
              WHERE id = ?
              `,
              [selected ? 1 : 0, approved ? 1 : 0, rejected, now, row.id],
            );
            updatedCandidates += 1;
            changedCandidateForItem = true;
          }
        }
        const status = nextStatusAfterRollback(rows, selectedTargets, approvedTargets);
        context.db.run(
          "UPDATE sound_usage_items SET status = ?, updated_at = ? WHERE id = ? AND library_id = ?",
          [status, now, current.id, context.library.id],
        );
        if (changedCandidateForItem || current.status !== status) {
          updatedUsageItems += 1;
        }
      }
    });

    return {
      ...preview,
      applied: true,
      updatedUsageItems,
      updatedCandidates,
    };
  }

  private listItems(snapshotId: string): SoundPackSnapshotItemRecord[] {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<SnapshotItemRow>(
      `
      SELECT *
      FROM sound_pack_snapshot_items
      WHERE snapshot_id = ?
      ORDER BY usage_key COLLATE NOCASE
      `,
      [snapshotId],
    );
    return rows.map(mapSnapshotItemRow);
  }

  private async createPayload(projectId: string, exportOptions?: Record<string, unknown>): Promise<SoundPackSnapshotPayload> {
    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const [items, validation] = await Promise.all([
      this.usageService.listItems({ projectId, sort: "key" }),
      this.validationService.validateBoard(projectId),
    ]);
    const itemPayloads: SoundPackSnapshotItemPayload[] = [];
    for (const item of items) {
      const candidates = (await this.candidateService.listCandidates(item.id)).map(sanitizeCandidateForSnapshot);
      const rightsByAssetId = loadRightsSnapshot(
        this.libraryService,
        candidates.filter((candidate) => candidate.selected || candidate.approved).map((candidate) => candidate.assetId),
      );
      itemPayloads.push({
        usageItem: sanitizeUsageItemForSnapshot(item),
        candidates,
        rightsByAssetId,
      });
    }
    return {
      version: 1,
      project,
      summary: this.projectService.getSummary(projectId),
      validation,
      items: itemPayloads,
      exportOptions,
    };
  }
}

function loadRightsSnapshot(libraryService: LibraryService, assetIds: string[]): SoundPackSnapshotItemPayload["rightsByAssetId"] {
  if (assetIds.length === 0) {
    return {};
  }
  const context = libraryService.requireActive();
  const placeholders = assetIds.map(() => "?").join(", ");
  const rows = context.db.all<RightsSnapshotRow>(
    `
    SELECT asset_id, license_name, commercial_use_status, credit_required, attribution_text, source_url
    FROM asset_rights_metadata
    WHERE asset_id IN (${placeholders})
    `,
    assetIds,
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.asset_id,
      {
        licenseName: row.license_name,
        commercialUseStatus: row.commercial_use_status,
        creditRequired: row.credit_required,
        attributionText: row.attribution_text,
        sourceUrl: row.source_url,
      },
    ]),
  );
}

function countSnapshot(payload: SoundPackSnapshotPayload): {
  itemCount: number;
  selectedCount: number;
  approvedCount: number;
  missingCount: number;
  warningCount: number;
  errorCount: number;
} {
  return {
    itemCount: payload.items.length,
    selectedCount: payload.items.reduce((sum, item) => sum + selectedAssetIds(item).length, 0),
    approvedCount: payload.items.reduce((sum, item) => sum + approvedAssetIds(item).length, 0),
    missingCount: payload.items.filter((item) => item.usageItem.status === "missing" || selectedAssetIds(item).length === 0).length,
    warningCount: payload.validation.issues.filter((issue) => issue.severity === "warning").length,
    errorCount: payload.validation.issues.filter((issue) => issue.severity === "error").length,
  };
}

function sanitizeUsageItemForSnapshot(item: SoundUsageItemRecord): SoundUsageItemRecord {
  return {
    ...item,
    selectedAsset: item.selectedAsset ? { ...item.selectedAsset, originalPath: "", storedPath: null } : null,
  };
}

function sanitizeCandidateForSnapshot(candidate: SoundUsageCandidateRecord): SoundUsageCandidateRecord {
  return {
    ...candidate,
    asset: candidate.asset ? { ...candidate.asset, originalPath: "", storedPath: null } : null,
  };
}

function selectedAssetIds(item: SoundPackSnapshotItemPayload): string[] {
  return item.candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.assetId).sort();
}

function approvedAssetIds(item: SoundPackSnapshotItemPayload): string[] {
  return item.candidates.filter((candidate) => candidate.approved).map((candidate) => candidate.assetId).sort();
}

function sameSet(left: string[], right: string[]): boolean {
  return left.slice().sort().join("\u0000") === right.slice().sort().join("\u0000");
}

function nextStatusAfterRollback(
  rows: CandidateFlagRow[],
  selectedTargets: Set<string>,
  approvedTargets: Set<string>,
): SoundUsageStatus {
  if (rows.some((row) => selectedTargets.has(row.asset_id) && approvedTargets.has(row.asset_id))) {
    return "approved";
  }
  if (rows.some((row) => selectedTargets.has(row.asset_id))) {
    return "selected";
  }
  return rows.length > 0 ? "reviewing" : "needs_candidates";
}

function mapSnapshotRow(row: SnapshotRow): SoundPackSnapshotRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    status: row.status,
    frozen: intToBool(row.frozen),
    itemCount: row.item_count,
    selectedCount: row.selected_count,
    approvedCount: row.approved_count,
    missingCount: row.missing_count,
    warningCount: row.warning_count,
    errorCount: row.error_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    exportHistoryId: row.export_history_id,
    payload: parseJson<SoundPackSnapshotPayload>(row.snapshot_json) ?? createEmptyPayload(row.project_id, row.library_id),
  };
}

function mapSnapshotItemRow(row: SnapshotItemRow): SoundPackSnapshotItemRecord {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    usageItemId: row.usage_item_id,
    usageKey: row.usage_key,
    displayName: row.display_name,
    category: row.category,
    status: row.status,
    priority: row.priority,
    required: intToBool(row.required),
    loopRequired: intToBool(row.loop_required),
    variantsAllowed: intToBool(row.variants_allowed),
    selectedAssetIds: parseJson<string[]>(row.selected_asset_ids_json) ?? [],
    approvedAssetIds: parseJson<string[]>(row.approved_asset_ids_json) ?? [],
    candidateAssetIds: parseJson<string[]>(row.candidate_asset_ids_json) ?? [],
    snapshotJson: parseJson<SoundPackSnapshotItemPayload>(row.item_json) ?? createEmptyItemPayload(row.usage_item_id, row.usage_key),
    createdAt: row.created_at,
  };
}

function mapPayloadToTransientItem(payload: SoundPackSnapshotItemPayload, now: string): SoundPackSnapshotItemRecord {
  return {
    id: randomUUID(),
    snapshotId: "current",
    usageItemId: payload.usageItem.id,
    usageKey: payload.usageItem.key,
    displayName: payload.usageItem.displayName,
    category: payload.usageItem.category,
    status: payload.usageItem.status,
    priority: payload.usageItem.priority,
    required: payload.usageItem.required,
    loopRequired: payload.usageItem.loopRequired,
    variantsAllowed: payload.usageItem.variantsAllowed,
    selectedAssetIds: selectedAssetIds(payload),
    approvedAssetIds: approvedAssetIds(payload),
    candidateAssetIds: payload.candidates.map((candidate) => candidate.assetId),
    snapshotJson: payload,
    createdAt: now,
  };
}

function createEmptyPayload(projectId: string, libraryId: string): SoundPackSnapshotPayload {
  const now = new Date().toISOString();
  const project: GameProjectRecord = {
    id: projectId,
    libraryId,
    name: projectId,
    description: "",
    engineType: "generic",
    rootNamespace: "",
    defaultExportFormat: "generic_manifest",
    baselineSnapshotId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  return {
    version: 1,
    project,
    summary: {
      projectId,
      total: 0,
      required: 0,
      missing: 0,
      needsCandidates: 0,
      reviewing: 0,
      selected: 0,
      approved: 0,
      rejected: 0,
      deferred: 0,
      requiredMissing: 0,
      noCandidates: 0,
    },
    validation: {
      projectId,
      ok: true,
      dashboard: {
        projectId,
        total: 0,
        required: 0,
        missing: 0,
        needsReview: 0,
        selected: 0,
        approved: 0,
        rejected: 0,
        deferred: 0,
        noCandidates: 0,
        risks: 0,
        unknownLicenseSelected: 0,
        loopWarnings: 0,
        playbackUnsupportedSelected: 0,
        missingFileSelected: 0,
      },
      issues: [],
    },
    items: [],
  };
}

function createEmptyItemPayload(usageItemId: string, usageKey: string): SoundPackSnapshotItemPayload {
  const now = new Date().toISOString();
  return {
    usageItem: {
      id: usageItemId,
      projectId: "",
      libraryId: "",
      key: usageKey,
      displayName: usageKey,
      category: "sfx",
      description: "",
      required: false,
      status: "missing",
      priority: "normal",
      loopRequired: false,
      variantsAllowed: false,
      targetDurationMs: null,
      targetLoudnessNote: "",
      notes: "",
      workNote: "",
      assignee: "",
      dueLabel: "",
      reviewNote: "",
      decisionNote: "",
      updatedWorkflowAt: null,
      candidateCount: 0,
      selectedCandidateCount: 0,
      selectedAsset: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
    candidates: [],
    rightsByAssetId: {},
  };
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function formatSnapshotTimestamp(value: string): string {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
}

import { randomUUID } from "node:crypto";
import type { BatchResult } from "../../shared/library-types";
import type {
  MissingSoundReport,
  SoundUsageItemInput,
  SoundUsageItemRecord,
  SoundUsageItemUpdateInput,
  SoundUsageListQuery,
  SoundUsageRiskFilter,
  SoundUsageTemplate,
  SoundUsageTemplateId,
} from "../../shared/sound-board-types";
import type { AssetService } from "./asset-service";
import { createBatchResult, recordFailure, recordSkipped, recordSuccess } from "./batch-result";
import { GameProjectService } from "./game-project-service";
import type { LibraryService } from "./library-service";
import {
  boolToInt,
  coerceUsageCategory,
  coerceUsagePriority,
  coerceUsageStatus,
  intToBool,
  normalizeOptionalText,
  normalizeTargetDuration,
  sanitizeUsageKey,
} from "./sound-board-helpers";

export interface SoundUsageItemRow {
  id: string;
  project_id: string;
  library_id: string;
  key: string;
  display_name: string;
  category: string;
  description: string;
  required: number;
  status: string;
  priority: string;
  loop_required: number;
  variants_allowed: number;
  target_duration_ms: number | null;
  target_loudness_note: string;
  notes: string;
  work_note: string;
  assignee: string;
  due_label: string;
  review_note: string;
  decision_note: string;
  updated_workflow_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface SoundUsageListRow extends SoundUsageItemRow {
  candidate_count: number;
  selected_candidate_count: number;
  approved_candidate_count: number;
  selected_asset_id: string | null;
  candidate_text: string | null;
}

interface CandidateStateRow {
  usage_item_id: string;
  total: number;
  selected_count: number;
  rejected_count: number;
}

export const SOUND_USAGE_TEMPLATES: SoundUsageTemplate[] = [
  { id: "empty", name: "Empty", items: [] },
  {
    id: "basic_mobile_ui",
    name: "Basic Mobile Game UI",
    items: [
      templateItem("ui.click", "UI Click", "ui", "normal"),
      templateItem("ui.confirm", "UI Confirm", "ui", "high"),
      templateItem("ui.cancel", "UI Cancel", "ui", "normal"),
      templateItem("ui.back", "UI Back", "ui", "normal"),
      templateItem("ui.notification", "Notification", "ui", "normal"),
      templateItem("ui.error", "Error Alert", "ui", "high"),
      templateItem("ui.transition", "Screen Transition", "ui", "normal"),
      templateItem("bgm.menu", "Menu BGM", "bgm", "normal", { loopRequired: true, targetDurationMs: 60000 }),
    ],
  },
  {
    id: "basic_rpg",
    name: "Basic RPG",
    items: [
      templateItem("bgm.town", "Town BGM", "bgm", "high", { loopRequired: true, targetDurationMs: 90000 }),
      templateItem("bgm.battle", "Battle BGM", "bgm", "critical", { loopRequired: true, targetDurationMs: 90000 }),
      templateItem("ambience.forest", "Forest Ambience", "ambience", "normal", { loopRequired: true }),
      templateItem("sfx.attack.light", "Light Attack", "sfx", "high", { variantsAllowed: true }),
      templateItem("sfx.attack.heavy", "Heavy Attack", "sfx", "high", { variantsAllowed: true }),
      templateItem("sfx.item.pickup", "Item Pickup", "sfx", "normal"),
      templateItem("sfx.menu.select", "Menu Select", "ui", "normal"),
      templateItem("voice.player.damage", "Player Damage Voice", "voice", "normal", { required: false, variantsAllowed: true }),
    ],
  },
  {
    id: "basic_action_game",
    name: "Basic Action Game",
    items: [
      templateItem("sfx.weapon.fire", "Weapon Fire", "sfx", "critical", { variantsAllowed: true }),
      templateItem("sfx.weapon.reload", "Reload", "sfx", "high"),
      templateItem("sfx.impact.enemy", "Enemy Impact", "sfx", "high", { variantsAllowed: true }),
      templateItem("sfx.explosion.small", "Small Explosion", "sfx", "high", { variantsAllowed: true }),
      templateItem("sfx.player.dash", "Player Dash", "sfx", "normal"),
      templateItem("ambience.level", "Level Ambience", "ambience", "normal", { loopRequired: true }),
      templateItem("bgm.action", "Action BGM", "bgm", "high", { loopRequired: true }),
    ],
  },
  {
    id: "basic_casual_game",
    name: "Basic Casual Game",
    items: [
      templateItem("ui.tap", "Tap", "ui", "normal"),
      templateItem("ui.success", "Success", "ui", "high"),
      templateItem("ui.fail", "Fail", "ui", "normal"),
      templateItem("sfx.reward", "Reward", "sfx", "high"),
      templateItem("sfx.combo", "Combo", "sfx", "normal", { variantsAllowed: true }),
      templateItem("bgm.main", "Main BGM", "bgm", "normal", { loopRequired: true }),
    ],
  },
];

export class SoundUsageService {
  private readonly projectService: GameProjectService;

  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
  ) {
    this.projectService = new GameProjectService(libraryService);
  }

  listTemplates(): SoundUsageTemplate[] {
    return SOUND_USAGE_TEMPLATES;
  }

  async listItems(query: SoundUsageListQuery): Promise<SoundUsageItemRecord[]> {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<SoundUsageListRow>(
      `
      SELECT
        i.*,
        COALESCE((SELECT COUNT(*) FROM sound_usage_candidates c WHERE c.usage_item_id = i.id), 0) AS candidate_count,
        COALESCE((SELECT COUNT(*) FROM sound_usage_candidates c WHERE c.usage_item_id = i.id AND c.selected = 1), 0) AS selected_candidate_count,
        COALESCE((SELECT COUNT(*) FROM sound_usage_candidates c WHERE c.usage_item_id = i.id AND c.approved = 1), 0) AS approved_candidate_count,
        (
          SELECT c.asset_id
          FROM sound_usage_candidates c
          WHERE c.usage_item_id = i.id AND c.selected = 1
          ORDER BY c.candidate_rank ASC, c.created_at ASC
          LIMIT 1
        ) AS selected_asset_id,
        COALESCE((
          SELECT GROUP_CONCAT(COALESCE(a.title, '') || ' ' || a.file_name, ' ')
          FROM sound_usage_candidates c
          JOIN assets a ON a.id = c.asset_id
          WHERE c.usage_item_id = i.id
        ), '') AS candidate_text
      FROM sound_usage_items i
      WHERE i.project_id = ?
        AND i.library_id = ?
        AND (? = 1 OR i.archived_at IS NULL)
        AND (? = 'all' OR i.status = ?)
        AND (? = 'all' OR i.category = ?)
        AND (? = 'all' OR i.priority = ?)
        AND (? = 0 OR i.required = 1)
      ORDER BY
        CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        i.category,
        i.key COLLATE NOCASE
      `,
      [
        query.projectId,
        context.library.id,
        query.includeArchived ? 1 : 0,
        query.status ?? "all",
        query.status ?? "all",
        query.category ?? "all",
        query.category ?? "all",
        query.priority ?? "all",
        query.priority ?? "all",
        query.requiredOnly ? 1 : 0,
      ],
    );
    const search = query.search?.trim().toLowerCase();
    const searchedRows = search
      ? rows.filter((row) =>
          [
            row.key,
            row.display_name,
            row.description,
            row.notes,
            row.work_note,
            row.assignee,
            row.due_label,
            row.review_note,
            row.decision_note,
            row.candidate_text ?? "",
          ].some((value) => value.toLowerCase().includes(search)),
        )
      : rows;
    const mapped = await Promise.all(searchedRows.map((row) => this.mapListRow(row)));
    if (query.riskFilter === "unknown_license_selected") {
      const itemIds = this.loadUnknownLicenseUsageItemIds(query.projectId);
      return sortUsageItems(mapped.filter((item) => itemIds.has(item.id)), query.sort);
    }
    if (query.riskFilter === "has_risks") {
      const unknownLicenseItemIds = this.loadUnknownLicenseUsageItemIds(query.projectId);
      return sortUsageItems(filterByRisk(mapped, query.riskFilter, unknownLicenseItemIds), query.sort);
    }
    return sortUsageItems(filterByRisk(mapped, query.riskFilter), query.sort);
  }

  async getItem(usageItemId: string): Promise<SoundUsageItemRecord | null> {
    const context = this.libraryService.requireActive();
    const row = context.db.get<SoundUsageListRow>(
      `
      SELECT
        i.*,
        COALESCE((SELECT COUNT(*) FROM sound_usage_candidates c WHERE c.usage_item_id = i.id), 0) AS candidate_count,
        COALESCE((SELECT COUNT(*) FROM sound_usage_candidates c WHERE c.usage_item_id = i.id AND c.selected = 1), 0) AS selected_candidate_count,
        COALESCE((SELECT COUNT(*) FROM sound_usage_candidates c WHERE c.usage_item_id = i.id AND c.approved = 1), 0) AS approved_candidate_count,
        (
          SELECT c.asset_id
          FROM sound_usage_candidates c
          WHERE c.usage_item_id = i.id AND c.selected = 1
          ORDER BY c.candidate_rank ASC, c.created_at ASC
          LIMIT 1
        ) AS selected_asset_id,
        '' AS candidate_text
      FROM sound_usage_items i
      WHERE i.id = ? AND i.library_id = ?
      `,
      [usageItemId, context.library.id],
    );
    return row ? this.mapListRow(row) : null;
  }

  async createItem(input: SoundUsageItemInput): Promise<SoundUsageItemRecord> {
    const context = this.libraryService.requireActive();
    const project = this.projectService.getProject(input.projectId);
    if (!project || project.libraryId !== context.library.id || project.archivedAt) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const key = sanitizeUsageKey(input.key || input.displayName || "sound");
    const now = new Date().toISOString();
    const id = randomUUID();
    context.db.run(
      `
      INSERT INTO sound_usage_items (
        id, project_id, library_id, key, display_name, category, description,
        required, status, priority, loop_required, variants_allowed,
        target_duration_ms, target_loudness_note, notes, work_note, assignee,
        due_label, review_note, decision_note, updated_workflow_at, created_at, updated_at, archived_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      [
        id,
        input.projectId,
        context.library.id,
        key,
        normalizeOptionalText(input.displayName) || key,
        coerceUsageCategory(input.category),
        normalizeOptionalText(input.description),
        input.required === false ? 0 : 1,
        coerceUsageStatus(input.status),
        coerceUsagePriority(input.priority),
        boolToInt(input.loopRequired),
        boolToInt(input.variantsAllowed),
        normalizeTargetDuration(input.targetDurationMs),
        normalizeOptionalText(input.targetLoudnessNote),
        normalizeOptionalText(input.notes),
        normalizeOptionalText(input.workNote),
        normalizeOptionalText(input.assignee),
        normalizeOptionalText(input.dueLabel),
        normalizeOptionalText(input.reviewNote),
        normalizeOptionalText(input.decisionNote),
        hasWorkflowInput(input) ? now : null,
        now,
        now,
      ],
    );
    const created = await this.getItem(id);
    if (!created) {
      throw new Error("USAGE_CREATE_FAILED");
    }
    return created;
  }

  async updateItem(usageItemId: string, input: SoundUsageItemUpdateInput): Promise<SoundUsageItemRecord> {
    const current = await this.getItem(usageItemId);
    if (!current) {
      throw new Error("USAGE_ITEM_NOT_FOUND");
    }
    const context = this.libraryService.requireActive();
    const key = input.key === undefined ? current.key : sanitizeUsageKey(input.key || current.displayName);
    const variantsAllowed = input.variantsAllowed === undefined ? current.variantsAllowed : input.variantsAllowed;
    const workflowChanged = hasWorkflowInput(input);
    const now = new Date().toISOString();
    context.db.transaction(() => {
      context.db.run(
        `
        UPDATE sound_usage_items
        SET key = ?,
            display_name = ?,
            category = ?,
            description = ?,
            required = ?,
            status = ?,
            priority = ?,
            loop_required = ?,
            variants_allowed = ?,
            target_duration_ms = ?,
            target_loudness_note = ?,
            notes = ?,
            work_note = ?,
            assignee = ?,
            due_label = ?,
            review_note = ?,
            decision_note = ?,
            updated_workflow_at = ?,
            archived_at = ?,
            updated_at = ?
        WHERE id = ? AND library_id = ?
        `,
        [
          key,
          input.displayName === undefined ? current.displayName : normalizeOptionalText(input.displayName) || key,
          input.category === undefined ? current.category : coerceUsageCategory(input.category),
          input.description === undefined ? current.description : normalizeOptionalText(input.description),
          input.required === undefined ? boolToInt(current.required) : boolToInt(input.required),
          input.status === undefined ? current.status : coerceUsageStatus(input.status),
          input.priority === undefined ? current.priority : coerceUsagePriority(input.priority),
          input.loopRequired === undefined ? boolToInt(current.loopRequired) : boolToInt(input.loopRequired),
          boolToInt(variantsAllowed),
          input.targetDurationMs === undefined ? current.targetDurationMs : normalizeTargetDuration(input.targetDurationMs),
          input.targetLoudnessNote === undefined
            ? current.targetLoudnessNote
            : normalizeOptionalText(input.targetLoudnessNote),
          input.notes === undefined ? current.notes : normalizeOptionalText(input.notes),
          input.workNote === undefined ? current.workNote : normalizeOptionalText(input.workNote),
          input.assignee === undefined ? current.assignee : normalizeOptionalText(input.assignee),
          input.dueLabel === undefined ? current.dueLabel : normalizeOptionalText(input.dueLabel),
          input.reviewNote === undefined ? current.reviewNote : normalizeOptionalText(input.reviewNote),
          input.decisionNote === undefined ? current.decisionNote : normalizeOptionalText(input.decisionNote),
          workflowChanged ? now : current.updatedWorkflowAt,
          input.archived === undefined ? current.archivedAt : input.archived ? now : null,
          now,
          usageItemId,
          context.library.id,
        ],
      );
      if (!variantsAllowed) {
        keepFirstSelectedCandidate(context, usageItemId);
      }
    });
    const updated = await this.getItem(usageItemId);
    if (!updated) {
      throw new Error("USAGE_UPDATE_FAILED");
    }
    return updated;
  }

  async deleteItem(usageItemId: string): Promise<SoundUsageItemRecord> {
    return this.updateItem(usageItemId, { archived: true });
  }

  async updateStatus(usageItemId: string, status: SoundUsageItemRecord["status"], note = ""): Promise<SoundUsageItemRecord> {
    const current = await this.getItem(usageItemId);
    if (!current) {
      throw new Error("USAGE_ITEM_NOT_FOUND");
    }
    const context = this.libraryService.requireActive();
    const now = new Date().toISOString();
    context.db.transaction(() => {
      context.db.run(
        "UPDATE sound_usage_items SET status = ?, updated_at = ?, updated_workflow_at = ? WHERE id = ? AND library_id = ?",
        [coerceUsageStatus(status), now, now, usageItemId, context.library.id],
      );
      context.db.run(
        `
        INSERT INTO sound_usage_status_history (id, usage_item_id, from_status, to_status, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [randomUUID(), usageItemId, current.status, coerceUsageStatus(status), note.trim(), now],
      );
    });
    const updated = await this.getItem(usageItemId);
    if (!updated) {
      throw new Error("USAGE_STATUS_UPDATE_FAILED");
    }
    return updated;
  }

  async applySuggestedKey(usageItemId: string, suggestedKey?: string): Promise<SoundUsageItemRecord> {
    const current = await this.getItem(usageItemId);
    if (!current) {
      throw new Error("USAGE_ITEM_NOT_FOUND");
    }
    return this.updateItem(usageItemId, { key: sanitizeUsageKey(suggestedKey ?? current.key) });
  }

  async bulkCreateFromTemplate(projectId: string, templateId: SoundUsageTemplateId): Promise<BatchResult> {
    const template = SOUND_USAGE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) {
      throw new Error("USAGE_TEMPLATE_NOT_FOUND");
    }
    const result = createBatchResult(template.items.length);
    for (const item of template.items) {
      try {
        await this.createItem({ ...item, projectId });
        recordSuccess(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("UNIQUE") || message.includes("constraint")) {
          recordSkipped(result, `${item.key}: duplicate key`);
        } else {
          recordFailure(result, item.key, message);
        }
      }
    }
    return result;
  }

  getSummary(projectId: string) {
    return this.projectService.getSummary(projectId);
  }

  async getMissingReport(projectId: string): Promise<MissingSoundReport> {
    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const [items, selectedUnknownLicenses] = await Promise.all([
      this.listItems({ projectId }),
      this.listSelectedUnknownLicenseCandidates(projectId),
    ]);
    const candidateStates = this.loadCandidateStates(items.map((item) => item.id));
    return {
      project,
      summary: this.getSummary(projectId),
      requiredMissing: items.filter((item) => item.required && ["missing", "needs_candidates"].includes(item.status)),
      noCandidates: items.filter((item) => item.candidateCount === 0),
      candidatesWithoutSelected: items.filter((item) => item.candidateCount > 0 && item.selectedCandidateCount === 0),
      rejectedOnly: items.filter((item) => {
        const state = candidateStates.get(item.id);
        return Boolean(state && state.total > 0 && state.rejected_count >= state.total);
      }),
      loopWarnings: items.filter((item) => {
        const selected = item.selectedAsset;
        if (!item.loopRequired || !selected) {
          return false;
        }
        const loopLikelihood = selected.audioAnalysis?.loopLikelihood;
        return loopLikelihood !== "high" && (selected.audioAnalysis?.loopScore ?? 0) < 0.72;
      }),
      unknownLicenseSelected: selectedUnknownLicenses,
    };
  }

  private async mapListRow(row: SoundUsageListRow): Promise<SoundUsageItemRecord> {
    const selectedAsset = row.selected_asset_id ? await this.assetService.getAsset(row.selected_asset_id) : null;
    return mapSoundUsageItemRow(row, row.candidate_count, row.selected_candidate_count, selectedAsset);
  }

  private loadCandidateStates(usageItemIds: string[]): Map<string, CandidateStateRow> {
    if (usageItemIds.length === 0) {
      return new Map();
    }
    const context = this.libraryService.requireActive();
    const placeholders = usageItemIds.map(() => "?").join(", ");
    const rows = context.db.all<CandidateStateRow>(
      `
      SELECT
        usage_item_id,
        COUNT(*) AS total,
        SUM(CASE WHEN selected = 1 THEN 1 ELSE 0 END) AS selected_count,
        SUM(CASE WHEN rejected = 1 THEN 1 ELSE 0 END) AS rejected_count
      FROM sound_usage_candidates
      WHERE usage_item_id IN (${placeholders})
      GROUP BY usage_item_id
      `,
      usageItemIds,
    );
    return new Map(rows.map((row) => [row.usage_item_id, row]));
  }

  private async listSelectedUnknownLicenseCandidates(projectId: string) {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<{
      id: string;
      usage_item_id: string;
      asset_id: string;
      candidate_rank: number;
      fit_score: number | null;
      fit_reason_json: string;
      user_note: string;
      selected: number;
      approved: number;
      rejected: number;
      created_at: string;
      updated_at: string;
      pros: string;
      cons: string;
      review_note: string;
      decision_reason: string;
      rating_for_usage: number | null;
      loudness_fit: string;
      loop_fit: string;
      mood_fit: string;
    }>(
      `
      SELECT c.*
      FROM sound_usage_candidates c
      JOIN sound_usage_items i ON i.id = c.usage_item_id
      LEFT JOIN asset_rights_metadata r ON r.asset_id = c.asset_id
      WHERE i.project_id = ?
        AND i.library_id = ?
        AND c.selected = 1
        AND (
          r.asset_id IS NULL
          OR r.license_name = ''
          OR r.commercial_use_status = 'unknown'
        )
      ORDER BY i.key COLLATE NOCASE
      `,
      [projectId, context.library.id],
    );
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        usageItemId: row.usage_item_id,
        assetId: row.asset_id,
        candidateRank: row.candidate_rank,
        fitScore: row.fit_score,
        fitReasons: parseFitReasons(row.fit_reason_json),
        userNote: row.user_note,
        pros: row.pros,
        cons: row.cons,
        reviewNote: row.review_note,
        decisionReason: row.decision_reason,
        ratingForUsage: row.rating_for_usage,
        loudnessFit: row.loudness_fit,
        loopFit: row.loop_fit,
        moodFit: row.mood_fit,
        selected: intToBool(row.selected),
        approved: intToBool(row.approved),
        rejected: intToBool(row.rejected),
        asset: await this.assetService.getAsset(row.asset_id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    );
  }

  private loadUnknownLicenseUsageItemIds(projectId: string): Set<string> {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<{ usage_item_id: string }>(
      `
      SELECT DISTINCT i.id AS usage_item_id
      FROM sound_usage_candidates c
      JOIN sound_usage_items i ON i.id = c.usage_item_id
      LEFT JOIN asset_rights_metadata r ON r.asset_id = c.asset_id
      WHERE i.project_id = ?
        AND i.library_id = ?
        AND c.selected = 1
        AND (
          r.asset_id IS NULL
          OR r.license_name = ''
          OR r.commercial_use_status = 'unknown'
        )
      `,
      [projectId, context.library.id],
    );
    return new Set(rows.map((row) => row.usage_item_id));
  }
}

export function mapSoundUsageItemRow(
  row: SoundUsageItemRow,
  candidateCount = 0,
  selectedCandidateCount = 0,
  selectedAsset: SoundUsageItemRecord["selectedAsset"] = null,
): SoundUsageItemRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    libraryId: row.library_id,
    key: row.key,
    displayName: row.display_name,
    category: coerceUsageCategory(row.category),
    description: row.description,
    required: intToBool(row.required),
    status: coerceUsageStatus(row.status),
    priority: coerceUsagePriority(row.priority),
    loopRequired: intToBool(row.loop_required),
    variantsAllowed: intToBool(row.variants_allowed),
    targetDurationMs: row.target_duration_ms,
    targetLoudnessNote: row.target_loudness_note,
    notes: row.notes,
    workNote: row.work_note,
    assignee: row.assignee,
    dueLabel: row.due_label,
    reviewNote: row.review_note,
    decisionNote: row.decision_note,
    updatedWorkflowAt: row.updated_workflow_at,
    candidateCount,
    selectedCandidateCount,
    selectedAsset,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function keepFirstSelectedCandidate(context: ReturnType<LibraryService["requireActive"]>, usageItemId: string): void {
  const rows = context.db.all<{ id: string }>(
    `
    SELECT id
    FROM sound_usage_candidates
    WHERE usage_item_id = ? AND selected = 1
    ORDER BY candidate_rank ASC, created_at ASC
    `,
    [usageItemId],
  );
  const keepId = rows[0]?.id;
  if (!keepId) {
    return;
  }
  context.db.run(
    `
    UPDATE sound_usage_candidates
    SET selected = 0, updated_at = ?
    WHERE usage_item_id = ? AND id <> ?
    `,
    [new Date().toISOString(), usageItemId, keepId],
  );
}

function templateItem(
  key: string,
  displayName: string,
  category: SoundUsageItemInput["category"],
  priority: SoundUsageItemInput["priority"],
  overrides: Partial<Omit<SoundUsageItemInput, "projectId" | "key" | "displayName" | "category" | "priority">> = {},
): Omit<SoundUsageItemInput, "projectId"> {
  return {
    key,
    displayName,
    category,
    priority,
    status: "missing",
    required: true,
    loopRequired: false,
    variantsAllowed: false,
    ...overrides,
  };
}

function parseFitReasons(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasWorkflowInput(input: Partial<SoundUsageItemInput & SoundUsageItemUpdateInput>): boolean {
  return [
    input.status,
    input.priority,
    input.workNote,
    input.assignee,
    input.dueLabel,
    input.reviewNote,
    input.decisionNote,
  ].some((value) => value !== undefined);
}

function filterByRisk(
  items: SoundUsageItemRecord[],
  riskFilter?: SoundUsageRiskFilter,
  unknownLicenseItemIds: Set<string> = new Set(),
): SoundUsageItemRecord[] {
  switch (riskFilter) {
    case "required":
      return items.filter((item) => item.required);
    case "critical":
      return items.filter((item) => item.priority === "critical");
    case "loop_required":
      return items.filter((item) => item.loopRequired);
    case "recently_updated":
      return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 100);
    case "missing_required":
      return items.filter((item) => item.required && item.selectedCandidateCount === 0);
    case "no_candidates":
      return items.filter((item) => item.candidateCount === 0);
    case "candidates_no_selected":
      return items.filter((item) => item.candidateCount > 0 && item.selectedCandidateCount === 0);
    case "selected_not_approved":
      return items.filter((item) => item.selectedCandidateCount > 0 && item.status !== "approved");
    case "approved":
      return items.filter((item) => item.status === "approved");
    case "deferred":
      return items.filter((item) => item.status === "deferred");
    case "rejected":
      return items.filter((item) => item.status === "rejected");
    case "loop_mismatch":
      return items.filter((item) => item.loopRequired && (item.selectedAsset?.audioAnalysis?.loopScore ?? 0) < 0.72);
    case "playback_unsupported_selected":
      return items.filter((item) => item.selectedAsset && !item.selectedAsset.playable);
    case "missing_file_selected":
      return items.filter((item) => item.selectedAsset?.fileMissing);
    case "has_risks":
      return items.filter(
        (item) =>
          (item.required && item.selectedCandidateCount === 0) ||
          item.candidateCount === 0 ||
          (item.loopRequired && (item.selectedAsset?.audioAnalysis?.loopScore ?? 0) < 0.72) ||
          Boolean(item.selectedAsset && (!item.selectedAsset.playable || item.selectedAsset.fileMissing)) ||
          unknownLicenseItemIds.has(item.id),
      );
    case "all":
    default:
      return items;
  }
}

function sortUsageItems(items: SoundUsageItemRecord[], sort?: SoundUsageListQuery["sort"]): SoundUsageItemRecord[] {
  const sorted = [...items];
  switch (sort) {
    case "status":
      return sorted.sort((left, right) => left.status.localeCompare(right.status) || left.key.localeCompare(right.key));
    case "category":
      return sorted.sort((left, right) => left.category.localeCompare(right.category) || left.key.localeCompare(right.key));
    case "candidateCount":
      return sorted.sort((left, right) => right.candidateCount - left.candidateCount || left.key.localeCompare(right.key));
    case "updatedDesc":
      return sorted.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    case "updatedWorkflow":
      return sorted.sort((left, right) =>
        (right.updatedWorkflowAt ?? right.updatedAt).localeCompare(left.updatedWorkflowAt ?? left.updatedAt),
      );
    case "key":
      return sorted.sort((left, right) => left.key.localeCompare(right.key));
    case "riskCount":
      return sorted.sort((left, right) => riskScore(right) - riskScore(left) || left.key.localeCompare(right.key));
    case "requiredFirst":
      return sorted.sort(
        (left, right) =>
          Number(right.required) - Number(left.required) ||
          priorityRank(left.priority) - priorityRank(right.priority) ||
          left.key.localeCompare(right.key),
      );
    case "priority":
    default:
      return sorted;
  }
}

function riskScore(item: SoundUsageItemRecord): number {
  return [
    item.required && item.selectedCandidateCount === 0,
    item.candidateCount === 0,
    item.loopRequired && (item.selectedAsset?.audioAnalysis?.loopScore ?? 0) < 0.72,
    item.selectedAsset && !item.selectedAsset.playable,
    item.selectedAsset?.fileMissing,
  ].filter(Boolean).length;
}

function priorityRank(priority: SoundUsageItemRecord["priority"]): number {
  switch (priority) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "normal":
      return 2;
    case "low":
    default:
      return 3;
  }
}

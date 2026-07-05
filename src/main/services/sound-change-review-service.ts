import { randomUUID } from "node:crypto";
import type {
  SoundBoardValidationIssue,
  SoundChangeReviewBaselineInput,
  SoundChangeReviewBulkUpdateInput,
  SoundChangeReviewCreateInput,
  SoundChangeReviewDetail,
  SoundChangeReviewItemRecord,
  SoundChangeReviewItemStatus,
  SoundChangeReviewItemUpdateInput,
  SoundChangeReviewListQuery,
  SoundChangeReviewRecord,
  SoundChangeReviewStatus,
  SoundChangeReviewSummary,
  SoundChangeReviewUpdateInput,
  SoundPackDiffChange,
} from "../../shared/sound-board-types";
import type { LibraryDatabase } from "../db/library-database";
import type { GameProjectService } from "./game-project-service";
import type { LibraryService } from "./library-service";
import { intToBool, normalizeOptionalText } from "./sound-board-helpers";
import type { SoundPackDiffService } from "./sound-pack-diff-service";

interface ReviewRow {
  id: string;
  library_id: string;
  project_id: string;
  name: string;
  description: string;
  from_snapshot_id: string | null;
  to_snapshot_id: string | null;
  compare_to_current: number;
  status: SoundChangeReviewStatus;
  summary_json: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface ReviewItemRow {
  id: string;
  review_id: string;
  usage_item_id: string | null;
  usage_key: string;
  change_type: SoundChangeReviewItemRecord["changeType"];
  severity: SoundChangeReviewItemRecord["severity"];
  status: SoundChangeReviewItemStatus;
  before_json: string;
  after_json: string;
  message_key: string;
  message: string;
  field: string;
  asset_id: string | null;
  reviewer_note: string;
  decision_reason: string;
  created_at: string;
  updated_at: string;
}

const REVIEW_STATUSES: SoundChangeReviewStatus[] = ["draft", "reviewing", "approved", "rejected", "archived"];
const ITEM_STATUSES: SoundChangeReviewItemStatus[] = ["pending", "approved", "rejected", "deferred"];

export class SoundChangeReviewService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly diffService: SoundPackDiffService,
    private readonly projectService: GameProjectService,
  ) {}

  async createFromDiff(input: SoundChangeReviewCreateInput): Promise<SoundChangeReviewDetail> {
    const context = this.libraryService.requireActive();
    const diff = await this.diffService.compare(input);
    const now = new Date().toISOString();
    const id = randomUUID();
    const name = input.name?.trim() || `${diff.fromName} -> ${diff.toName} Review`;
    const status = normalizeReviewStatus(input.status, "reviewing");
    const items = diff.changes.map((change): SoundChangeReviewItemRecord => ({
      id: randomUUID(),
      reviewId: id,
      usageItemId: change.usageItemId ?? null,
      usageKey: change.usageKey,
      changeType: change.type,
      severity: change.severity,
      status: "pending",
      before: change.before ?? null,
      after: change.after ?? null,
      messageKey: `soundBoard.review.change.${change.type}`,
      message: change.message,
      field: change.field ?? "",
      assetId: change.assetId ?? null,
      reviewerNote: "",
      decisionReason: "",
      createdAt: now,
      updatedAt: now,
    }));
    const summary = summarizeReviewItems(items);

    context.db.transaction(() => {
      context.db.run(
        `
        INSERT INTO sound_change_reviews (
          id, library_id, project_id, name, description, from_snapshot_id, to_snapshot_id,
          compare_to_current, status, summary_json, created_at, updated_at, archived_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          context.library.id,
          diff.projectId,
          name,
          normalizeOptionalText(input.description),
          diff.fromSnapshotId,
          diff.toSnapshotId,
          diff.toCurrent ? 1 : 0,
          status,
          JSON.stringify(summary),
          now,
          now,
          null,
        ],
      );
      for (const item of items) {
        insertReviewItem(context.db, item);
      }
    });

    const created = this.get(id);
    if (!created) {
      throw new Error("CHANGE_REVIEW_CREATE_FAILED");
    }
    return created;
  }

  async createFromBaseline(input: SoundChangeReviewBaselineInput): Promise<SoundChangeReviewDetail> {
    const project = this.projectService.getProject(input.projectId);
    if (!project?.baselineSnapshotId) {
      throw new Error("CHANGE_REVIEW_BASELINE_MISSING");
    }
    return this.createFromDiff({
      projectId: input.projectId,
      fromSnapshotId: project.baselineSnapshotId,
      compareToCurrent: true,
      name: input.name ?? `${project.name} Baseline Review`,
      description: input.description,
    });
  }

  list(query: SoundChangeReviewListQuery): SoundChangeReviewRecord[] {
    const context = this.libraryService.requireActive();
    const where = ["library_id = ?", "project_id = ?"];
    const params: Array<string | number> = [context.library.id, query.projectId];
    if (!query.includeArchived) {
      where.push("archived_at IS NULL");
    }
    const rows = context.db.all<ReviewRow>(
      `
      SELECT *
      FROM sound_change_reviews
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      `,
      params,
    );
    return rows.map(mapReviewRow);
  }

  get(reviewId: string): SoundChangeReviewDetail | null {
    const context = this.libraryService.requireActive();
    const row = context.db.get<ReviewRow>(
      "SELECT * FROM sound_change_reviews WHERE id = ? AND library_id = ?",
      [reviewId, context.library.id],
    );
    if (!row) {
      return null;
    }
    return { ...mapReviewRow(row), items: this.listItems(reviewId) };
  }

  getLatest(projectId: string): SoundChangeReviewDetail | null {
    const context = this.libraryService.requireActive();
    const row = context.db.get<ReviewRow>(
      `
      SELECT *
      FROM sound_change_reviews
      WHERE library_id = ? AND project_id = ? AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [context.library.id, projectId],
    );
    return row ? this.get(row.id) : null;
  }

  update(reviewId: string, input: SoundChangeReviewUpdateInput): SoundChangeReviewDetail {
    const current = this.get(reviewId);
    if (!current) {
      throw new Error("CHANGE_REVIEW_LOAD_FAILED");
    }
    const context = this.libraryService.requireActive();
    const status = input.status ? normalizeReviewStatus(input.status, current.status) : current.status;
    const now = new Date().toISOString();
    const archivedAt = status === "archived" ? current.archivedAt ?? now : current.archivedAt;
    context.db.run(
      `
      UPDATE sound_change_reviews
      SET name = ?, description = ?, status = ?, updated_at = ?, archived_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [
        input.name?.trim() || current.name,
        input.description === undefined ? current.description : normalizeOptionalText(input.description),
        status,
        now,
        archivedAt,
        reviewId,
        context.library.id,
      ],
    );
    return this.requireReview(reviewId);
  }

  archive(reviewId: string): SoundChangeReviewDetail {
    const context = this.libraryService.requireActive();
    const current = this.requireReview(reviewId);
    const now = new Date().toISOString();
    context.db.run(
      `
      UPDATE sound_change_reviews
      SET status = 'archived', archived_at = ?, updated_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [current.archivedAt ?? now, now, reviewId, context.library.id],
    );
    return this.requireReview(reviewId);
  }

  updateItemStatus(itemId: string, input: SoundChangeReviewItemUpdateInput): SoundChangeReviewItemRecord {
    return this.updateItem(itemId, input);
  }

  updateItemNote(itemId: string, input: SoundChangeReviewItemUpdateInput): SoundChangeReviewItemRecord {
    return this.updateItem(itemId, input);
  }

  bulkUpdateItems(input: SoundChangeReviewBulkUpdateInput): SoundChangeReviewDetail {
    const context = this.libraryService.requireActive();
    const status = normalizeItemStatus(input.status, "pending");
    const now = new Date().toISOString();
    context.db.transaction(() => {
      for (const itemId of input.itemIds) {
        context.db.run(
          `
          UPDATE sound_change_review_items
          SET status = ?, decision_reason = COALESCE(NULLIF(?, ''), decision_reason), updated_at = ?
          WHERE id = ? AND review_id = ?
          `,
          [status, normalizeOptionalText(input.decisionReason), now, itemId, input.reviewId],
        );
      }
      this.updateReviewSummary(input.reviewId);
    });
    return this.requireReview(input.reviewId);
  }

  async getValidationIssues(projectId: string): Promise<SoundBoardValidationIssue[]> {
    const project = this.projectService.getProject(projectId);
    const latest = this.getLatest(projectId);
    const issues: SoundBoardValidationIssue[] = [];
    if (project?.baselineSnapshotId && !latest) {
      issues.push(createReviewIssue("BASELINE_CHANGES_NO_REVIEW", "Baseline snapshot is set but no change review has been created."));
      return issues;
    }
    if (!latest) {
      return issues;
    }
    const pendingBreaking = latest.items.filter((item) => item.status === "pending" && item.severity === "breaking");
    const pendingSelected = latest.items.filter(
      (item) => item.status === "pending" && (item.changeType === "selection_changed" || item.changeType === "approval_changed"),
    );
    const pendingRights = latest.items.filter((item) => item.status === "pending" && item.changeType === "rights_changed");
    const rejected = latest.items.filter((item) => item.status === "rejected");
    if (pendingBreaking.length > 0) {
      issues.push(createReviewIssue("PENDING_BREAKING_CHANGES", `${pendingBreaking.length} breaking change(s) are still pending review.`));
    }
    if (pendingSelected.length > 0) {
      issues.push(createReviewIssue("PENDING_SELECTED_ASSET_CHANGES", `${pendingSelected.length} selected/approved asset change(s) are still pending review.`));
    }
    if (pendingRights.length > 0) {
      issues.push(createReviewIssue("PENDING_RIGHTS_CHANGES", `${pendingRights.length} rights change(s) are still pending review.`));
    }
    if (rejected.length > 0) {
      issues.push(createReviewIssue("REJECTED_CHANGE_STILL_PRESENT", `${rejected.length} rejected change(s) are still present in the latest review.`));
    }
    return issues;
  }

  createDecisionMap(reviewId: string): Map<string, SoundChangeReviewItemRecord> {
    const review = this.get(reviewId);
    if (!review) {
      return new Map();
    }
    return new Map(review.items.map((item) => [decisionKeyFromReviewItem(item), item]));
  }

  decisionKeyForChange(change: SoundPackDiffChange): string {
    return decisionKey({
      usageKey: change.usageKey,
      changeType: change.type,
      field: change.field ?? "",
      assetId: change.assetId ?? "",
      before: change.before ?? null,
      after: change.after ?? null,
    });
  }

  private updateItem(itemId: string, input: SoundChangeReviewItemUpdateInput): SoundChangeReviewItemRecord {
    const context = this.libraryService.requireActive();
    const current = this.getItem(itemId);
    if (!current) {
      throw new Error("CHANGE_REVIEW_ITEM_UPDATE_FAILED");
    }
    const now = new Date().toISOString();
    context.db.run(
      `
      UPDATE sound_change_review_items
      SET status = ?, reviewer_note = ?, decision_reason = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        input.status ? normalizeItemStatus(input.status, current.status) : current.status,
        input.reviewerNote === undefined ? current.reviewerNote : normalizeOptionalText(input.reviewerNote),
        input.decisionReason === undefined ? current.decisionReason : normalizeOptionalText(input.decisionReason),
        now,
        itemId,
      ],
    );
    this.updateReviewSummary(current.reviewId);
    const updated = this.getItem(itemId);
    if (!updated) {
      throw new Error("CHANGE_REVIEW_ITEM_UPDATE_FAILED");
    }
    return updated;
  }

  private getItem(itemId: string): SoundChangeReviewItemRecord | null {
    const context = this.libraryService.requireActive();
    const row = context.db.get<ReviewItemRow>("SELECT * FROM sound_change_review_items WHERE id = ?", [itemId]);
    return row ? mapReviewItemRow(row) : null;
  }

  private listItems(reviewId: string): SoundChangeReviewItemRecord[] {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<ReviewItemRow>(
      `
      SELECT *
      FROM sound_change_review_items
      WHERE review_id = ?
      ORDER BY
        CASE severity WHEN 'breaking' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        usage_key COLLATE NOCASE,
        change_type
      `,
      [reviewId],
    );
    return rows.map(mapReviewItemRow);
  }

  private updateReviewSummary(reviewId: string): void {
    const context = this.libraryService.requireActive();
    const items = this.listItems(reviewId);
    const now = new Date().toISOString();
    context.db.run(
      "UPDATE sound_change_reviews SET summary_json = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(summarizeReviewItems(items)), now, reviewId],
    );
  }

  private requireReview(reviewId: string): SoundChangeReviewDetail {
    const review = this.get(reviewId);
    if (!review) {
      throw new Error("CHANGE_REVIEW_LOAD_FAILED");
    }
    return review;
  }
}

function insertReviewItem(db: LibraryDatabase, item: SoundChangeReviewItemRecord): void {
  db.run(
    `
    INSERT INTO sound_change_review_items (
      id, review_id, usage_item_id, usage_key, change_type, severity, status,
      before_json, after_json, message_key, message, field, asset_id,
      reviewer_note, decision_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      item.id,
      item.reviewId,
      item.usageItemId,
      item.usageKey,
      item.changeType,
      item.severity,
      item.status,
      JSON.stringify(item.before ?? null),
      JSON.stringify(item.after ?? null),
      item.messageKey,
      item.message,
      item.field,
      item.assetId,
      item.reviewerNote,
      item.decisionReason,
      item.createdAt,
      item.updatedAt,
    ],
  );
}

function summarizeReviewItems(items: Pick<SoundChangeReviewItemRecord, "status" | "severity" | "changeType" | "before" | "after">[]): SoundChangeReviewSummary {
  return {
    totalChanges: items.length,
    pending: items.filter((item) => item.status === "pending").length,
    approved: items.filter((item) => item.status === "approved").length,
    rejected: items.filter((item) => item.status === "rejected").length,
    deferred: items.filter((item) => item.status === "deferred").length,
    breaking: items.filter((item) => item.severity === "breaking").length,
    warnings: items.filter((item) => item.severity === "warning").length,
    info: items.filter((item) => item.severity === "info").length,
    newRisks: items.filter((item) => item.changeType === "risk_changed" && item.after === true).length,
    resolvedRisks: items.filter((item) => item.changeType === "risk_changed" && item.after === false).length,
    selectedChanged: items.filter((item) => item.changeType === "selection_changed" || item.changeType === "approval_changed").length,
    rightsChanged: items.filter((item) => item.changeType === "rights_changed").length,
  };
}

function mapReviewRow(row: ReviewRow): SoundChangeReviewRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    fromSnapshotId: row.from_snapshot_id,
    toSnapshotId: row.to_snapshot_id,
    compareToCurrent: intToBool(row.compare_to_current),
    status: row.status,
    summary: parseJson<SoundChangeReviewSummary>(row.summary_json) ?? createEmptySummary(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function mapReviewItemRow(row: ReviewItemRow): SoundChangeReviewItemRecord {
  return {
    id: row.id,
    reviewId: row.review_id,
    usageItemId: row.usage_item_id,
    usageKey: row.usage_key,
    changeType: row.change_type,
    severity: row.severity,
    status: row.status,
    before: parseJson<unknown>(row.before_json),
    after: parseJson<unknown>(row.after_json),
    messageKey: row.message_key,
    message: row.message,
    field: row.field,
    assetId: row.asset_id,
    reviewerNote: row.reviewer_note,
    decisionReason: row.decision_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createEmptySummary(): SoundChangeReviewSummary {
  return {
    totalChanges: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    deferred: 0,
    breaking: 0,
    warnings: 0,
    info: 0,
    newRisks: 0,
    resolvedRisks: 0,
    selectedChanged: 0,
    rightsChanged: 0,
  };
}

function normalizeReviewStatus(value: unknown, fallback: SoundChangeReviewStatus): SoundChangeReviewStatus {
  return REVIEW_STATUSES.includes(value as SoundChangeReviewStatus) ? (value as SoundChangeReviewStatus) : fallback;
}

function normalizeItemStatus(value: unknown, fallback: SoundChangeReviewItemStatus): SoundChangeReviewItemStatus {
  return ITEM_STATUSES.includes(value as SoundChangeReviewItemStatus) ? (value as SoundChangeReviewItemStatus) : fallback;
}

function createReviewIssue(code: SoundBoardValidationIssue["code"], message: string): SoundBoardValidationIssue {
  return {
    id: randomUUID(),
    severity: "warning",
    code,
    message,
  };
}

function decisionKeyFromReviewItem(item: SoundChangeReviewItemRecord): string {
  return decisionKey({
    usageKey: item.usageKey,
    changeType: item.changeType,
    field: item.field,
    assetId: item.assetId ?? "",
    before: item.before ?? null,
    after: item.after ?? null,
  });
}

function decisionKey(input: {
  usageKey: string;
  changeType: string;
  field: string;
  assetId: string;
  before: unknown;
  after: unknown;
}): string {
  return JSON.stringify({
    usageKey: input.usageKey,
    changeType: input.changeType,
    field: input.field,
    assetId: input.assetId,
    before: input.before,
    after: input.after,
  });
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

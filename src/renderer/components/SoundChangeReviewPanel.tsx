import { Archive, Check, Clipboard, Download, FileText, GitCompareArrows, Plus, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ExportOptions } from "../../shared/export-types";
import type {
  GameProjectRecord,
  SoundChangeReviewDetail,
  SoundChangeReviewItemRecord,
  SoundChangeReviewItemStatus,
  SoundChangeReviewRecord,
  SoundPackDiffSeverity,
  SoundPackSnapshotRecord,
} from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface SoundChangeReviewPanelProps {
  project: GameProjectRecord;
  disabled?: boolean;
  onOpenExportCenter: (initialOptions: Partial<ExportOptions>) => void;
  onSelectUsageItem: (usageItemId: string) => void;
}

type ReviewStatusFilter = SoundChangeReviewItemStatus | "all";
type ReviewSeverityFilter = SoundPackDiffSeverity | "all";

const ITEM_STATUS_OPTIONS: ReviewStatusFilter[] = ["all", "pending", "approved", "rejected", "deferred"];
const SEVERITY_OPTIONS: ReviewSeverityFilter[] = ["all", "breaking", "warning", "info"];

export function SoundChangeReviewPanel({
  project,
  disabled = false,
  onOpenExportCenter,
  onSelectUsageItem,
}: SoundChangeReviewPanelProps): JSX.Element {
  const { t, format } = useI18n();
  const [reviews, setReviews] = useState<SoundChangeReviewRecord[]>([]);
  const [snapshots, setSnapshots] = useState<SoundPackSnapshotRecord[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [detail, setDetail] = useState<SoundChangeReviewDetail | null>(null);
  const [fromSnapshotId, setFromSnapshotId] = useState("");
  const [toSnapshotId, setToSnapshotId] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<ReviewSeverityFilter>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadAll();
  }, [project.id]);

  useEffect(() => {
    if (!selectedReviewId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedReviewId);
  }, [selectedReviewId]);

  const selectedReview = useMemo(
    () => reviews.find((review) => review.id === selectedReviewId) ?? reviews[0] ?? null,
    [reviews, selectedReviewId],
  );

  const filteredItems = useMemo(() => {
    const items = detail?.items ?? [];
    return items
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .filter((item) => severityFilter === "all" || item.severity === severityFilter)
      .sort((left, right) => {
        const severityOrder = severityRank(left.severity) - severityRank(right.severity);
        if (severityOrder !== 0) {
          return severityOrder;
        }
        const statusOrder = statusRank(left.status) - statusRank(right.status);
        if (statusOrder !== 0) {
          return statusOrder;
        }
        return left.usageKey.localeCompare(right.usageKey);
      });
  }, [detail, severityFilter, statusFilter]);

  async function loadAll(): Promise<void> {
    const [nextReviews, nextSnapshots] = await Promise.all([
      window.suwolAudio.changeReviews.list({ projectId: project.id }),
      window.suwolAudio.soundSnapshots.list(project.id),
    ]);
    setReviews(nextReviews);
    setSnapshots(nextSnapshots);
    setSelectedReviewId((current) => current && nextReviews.some((review) => review.id === current) ? current : nextReviews[0]?.id ?? "");
    setFromSnapshotId((current) => current && nextSnapshots.some((snapshot) => snapshot.id === current) ? current : project.baselineSnapshotId ?? nextSnapshots[0]?.id ?? "");
    setToSnapshotId((current) => current && nextSnapshots.some((snapshot) => snapshot.id === current) ? current : "");
  }

  async function loadDetail(reviewId: string): Promise<void> {
    setDetail(await window.suwolAudio.changeReviews.get(reviewId));
  }

  async function runTask(task: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("soundBoard.review.errorGeneric" as MessageKey));
    } finally {
      setBusy(false);
    }
  }

  async function createFromBaseline(): Promise<void> {
    const review = await window.suwolAudio.changeReviews.createFromBaseline({ projectId: project.id });
    await loadAll();
    setSelectedReviewId(review.id);
    setMessage(t("soundBoard.review.created" as MessageKey));
  }

  async function createFromSnapshots(): Promise<void> {
    if (!fromSnapshotId) {
      return;
    }
    const review = await window.suwolAudio.changeReviews.createFromDiff({
      projectId: project.id,
      fromSnapshotId,
      toSnapshotId: toSnapshotId || undefined,
      compareToCurrent: !toSnapshotId,
    });
    await loadAll();
    setSelectedReviewId(review.id);
    setMessage(t("soundBoard.review.created" as MessageKey));
  }

  async function archiveReview(): Promise<void> {
    if (!detail || !window.confirm(t("soundBoard.review.archiveConfirm" as MessageKey))) {
      return;
    }
    await window.suwolAudio.changeReviews.archive(detail.id);
    await loadAll();
    setMessage(t("soundBoard.review.archived" as MessageKey));
  }

  async function updateItemStatus(item: SoundChangeReviewItemRecord, status: SoundChangeReviewItemStatus): Promise<void> {
    await window.suwolAudio.changeReviews.updateItemStatus(item.id, { status });
    if (detail) {
      await loadDetail(detail.id);
    }
  }

  async function bulkUpdate(status: SoundChangeReviewItemStatus): Promise<void> {
    if (!detail || filteredItems.length === 0) {
      return;
    }
    await window.suwolAudio.changeReviews.bulkUpdateItems({
      reviewId: detail.id,
      itemIds: filteredItems.map((item) => item.id),
      status,
    });
    await loadDetail(detail.id);
  }

  async function saveItemNote(item: SoundChangeReviewItemRecord, input: { reviewerNote?: string; decisionReason?: string }): Promise<void> {
    await window.suwolAudio.changeReviews.updateItemNote(item.id, input);
    if (detail) {
      await loadDetail(detail.id);
    }
  }

  function openReviewReport(): void {
    if (!detail) {
      return;
    }
    onOpenExportCenter({
      target: "sound_change_review_markdown",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      reviewId: detail.id,
      includePending: true,
      includeApproved: true,
      includeRejected: true,
      includeDeferred: true,
      includeReviewerNotes: true,
      includeDecisionReasons: true,
      includeBeforeAfterDetails: true,
    });
  }

  function openDecisionChangelog(): void {
    if (!detail?.fromSnapshotId) {
      return;
    }
    onOpenExportCenter({
      target: "sound_pack_changelog_markdown",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      reviewId: detail.id,
      fromSnapshotId: detail.fromSnapshotId,
      toSnapshotId: detail.toSnapshotId ?? undefined,
      compareToCurrent: detail.compareToCurrent,
      includeDiffSummary: true,
      includeReviewDecisions: true,
      excludeRejectedChanges: true,
      includeDeferredChanges: false,
      includeCandidateChanges: true,
      includeRightsChanges: true,
      includeRiskChanges: true,
    });
  }

  async function copySummary(): Promise<void> {
    if (!detail) {
      return;
    }
    const text = `${detail.name}: ${detail.summary.totalChanges} changes, ${detail.summary.pending} pending, ${detail.summary.approved} approved, ${detail.summary.rejected} rejected.`;
    await navigator.clipboard?.writeText(text);
    setMessage(t("soundBoard.review.summaryCopied" as MessageKey));
  }

  return (
    <section className="sound-export-panel sound-review-panel">
      <div className="section-heading-row">
        <div>
          <h3>{t("soundBoard.review.title" as MessageKey)}</h3>
          <p className="muted">{t("soundBoard.review.policy" as MessageKey)}</p>
        </div>
        <button className="primary-button compact" type="button" disabled={disabled || busy || !project.baselineSnapshotId} onClick={() => void runTask(createFromBaseline)}>
          <Plus size={14} aria-hidden="true" />
          {t("soundBoard.review.fromBaseline" as MessageKey)}
        </button>
      </div>

      <div className="sound-export-actions">
        <select value={selectedReview?.id ?? ""} disabled={disabled || busy || reviews.length === 0} onChange={(event) => setSelectedReviewId(event.target.value)}>
          {reviews.length === 0 ? <option value="">{t("soundBoard.review.empty" as MessageKey)}</option> : null}
          {reviews.map((review) => (
            <option key={review.id} value={review.id}>{review.name}</option>
          ))}
        </select>
        <button className="secondary-button compact" type="button" disabled={!detail || disabled || busy} onClick={() => void runTask(copySummary)}>
          <Clipboard size={14} aria-hidden="true" />
          {t("soundBoard.review.copySummary" as MessageKey)}
        </button>
        <button className="danger-button compact" type="button" disabled={!detail || disabled || busy} onClick={() => void runTask(archiveReview)}>
          <Archive size={14} aria-hidden="true" />
          {t("soundBoard.review.archive" as MessageKey)}
        </button>
      </div>

      <div className="sound-export-actions">
        <select value={fromSnapshotId} disabled={disabled || busy || snapshots.length === 0} onChange={(event) => setFromSnapshotId(event.target.value)}>
          {snapshots.map((snapshot) => (
            <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>
          ))}
        </select>
        <select value={toSnapshotId} disabled={disabled || busy || snapshots.length === 0} onChange={(event) => setToSnapshotId(event.target.value)}>
          <option value="">{t("soundBoard.review.currentBoard" as MessageKey)}</option>
          {snapshots.filter((snapshot) => snapshot.id !== fromSnapshotId).map((snapshot) => (
            <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>
          ))}
        </select>
        <button className="secondary-button compact" type="button" disabled={!fromSnapshotId || disabled || busy} onClick={() => void runTask(createFromSnapshots)}>
          <GitCompareArrows size={14} aria-hidden="true" />
          {t("soundBoard.review.fromSnapshots" as MessageKey)}
        </button>
      </div>

      {detail ? (
        <>
          <div className="snapshot-summary review-summary">
            <span>{t("soundBoard.review.total" as MessageKey, { count: format.number(detail.summary.totalChanges) })}</span>
            <span>{t("soundBoard.review.pendingCount" as MessageKey, { count: format.number(detail.summary.pending) })}</span>
            <span>{t("soundBoard.review.approvedCount" as MessageKey, { count: format.number(detail.summary.approved) })}</span>
            <span>{t("soundBoard.review.rejectedCount" as MessageKey, { count: format.number(detail.summary.rejected) })}</span>
            <span>{t("soundBoard.review.breakingCount" as MessageKey, { count: format.number(detail.summary.breaking) })}</span>
          </div>

          <div className="sound-export-actions">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ReviewStatusFilter)}>
              {ITEM_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status === "all" ? t("common.all" as MessageKey) : t(`soundBoard.review.status.${status}` as MessageKey)}</option>
              ))}
            </select>
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as ReviewSeverityFilter)}>
              {SEVERITY_OPTIONS.map((severity) => (
                <option key={severity} value={severity}>{severity === "all" ? t("common.all" as MessageKey) : t(`soundBoard.review.severity.${severity}` as MessageKey)}</option>
              ))}
            </select>
          </div>

          <div className="sound-export-actions">
            <button className="secondary-button compact" type="button" disabled={filteredItems.length === 0 || disabled || busy} onClick={() => void runTask(() => bulkUpdate("approved"))}>
              <Check size={14} aria-hidden="true" />
              {t("soundBoard.review.approveVisible" as MessageKey)}
            </button>
            <button className="secondary-button compact" type="button" disabled={filteredItems.length === 0 || disabled || busy} onClick={() => void runTask(() => bulkUpdate("deferred"))}>
              {t("soundBoard.review.deferVisible" as MessageKey)}
            </button>
            <button className="danger-button compact" type="button" disabled={filteredItems.length === 0 || disabled || busy} onClick={() => void runTask(() => bulkUpdate("rejected"))}>
              <XCircle size={14} aria-hidden="true" />
              {t("soundBoard.review.rejectVisible" as MessageKey)}
            </button>
          </div>

          <div className="sound-export-actions">
            <button className="secondary-button compact" type="button" disabled={disabled || busy} onClick={openReviewReport}>
              <Download size={14} aria-hidden="true" />
              {t("soundBoard.review.exportReport" as MessageKey)}
            </button>
            <button className="secondary-button compact" type="button" disabled={!detail.fromSnapshotId || disabled || busy} onClick={openDecisionChangelog}>
              <FileText size={14} aria-hidden="true" />
              {t("soundBoard.review.decisionChangelog" as MessageKey)}
            </button>
          </div>

          <div className="review-item-list">
            {filteredItems.length === 0 ? <p className="muted">{t("soundBoard.review.noItems" as MessageKey)}</p> : null}
            {filteredItems.map((item) => (
              <article key={item.id} className={`review-item-card severity-${item.severity}`}>
                <div className="review-item-header">
                  <div>
                    <strong>{item.usageKey}</strong>
                    <small>{t(`soundBoard.review.changeType.${item.changeType}` as MessageKey)} / {t(`soundBoard.review.severity.${item.severity}` as MessageKey)}</small>
                  </div>
                  <span className={`status-badge status-${item.status}`}>{t(`soundBoard.review.status.${item.status}` as MessageKey)}</span>
                </div>
                <p>{item.message}</p>
                <div className="review-item-diff">
                  <span>{t("soundBoard.review.before" as MessageKey)}: {formatValue(item.before)}</span>
                  <span>{t("soundBoard.review.after" as MessageKey)}: {formatValue(item.after)}</span>
                </div>
                <div className="sound-export-actions">
                  <button className="secondary-button compact" type="button" disabled={disabled || busy} onClick={() => void runTask(() => updateItemStatus(item, "approved"))}>
                    {t("soundBoard.review.approve" as MessageKey)}
                  </button>
                  <button className="secondary-button compact" type="button" disabled={disabled || busy} onClick={() => void runTask(() => updateItemStatus(item, "deferred"))}>
                    {t("soundBoard.review.defer" as MessageKey)}
                  </button>
                  <button className="danger-button compact" type="button" disabled={disabled || busy} onClick={() => void runTask(() => updateItemStatus(item, "rejected"))}>
                    {t("soundBoard.review.reject" as MessageKey)}
                  </button>
                  {item.usageItemId ? (
                    <button className="secondary-button compact" type="button" onClick={() => onSelectUsageItem(item.usageItemId!)}>
                      {t("soundBoard.review.openUsageItem" as MessageKey)}
                    </button>
                  ) : null}
                </div>
                <label>
                  {t("soundBoard.review.reviewerNote" as MessageKey)}
                  <textarea defaultValue={item.reviewerNote} rows={2} onBlur={(event) => void runTask(() => saveItemNote(item, { reviewerNote: event.currentTarget.value }))} />
                </label>
                <label>
                  {t("soundBoard.review.decisionReason" as MessageKey)}
                  <textarea defaultValue={item.decisionReason} rows={2} onBlur={(event) => void runTask(() => saveItemNote(item, { decisionReason: event.currentTarget.value }))} />
                </label>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {message ? <p className="compact-status">{message}</p> : null}
    </section>
  );
}

function severityRank(severity: SoundPackDiffSeverity): number {
  if (severity === "breaking") {
    return 0;
  }
  if (severity === "warning") {
    return 1;
  }
  return 2;
}

function statusRank(status: SoundChangeReviewItemStatus): number {
  if (status === "pending") {
    return 0;
  }
  if (status === "deferred") {
    return 1;
  }
  if (status === "rejected") {
    return 2;
  }
  return 3;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

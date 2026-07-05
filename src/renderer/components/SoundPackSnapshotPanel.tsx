import { Check, Download, GitCompareArrows, Lock, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ExportOptions } from "../../shared/export-types";
import type {
  GameProjectRecord,
  SoundPackDiffResult,
  SoundPackRollbackPreview,
  SoundPackSnapshotRecord,
} from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface SoundPackSnapshotPanelProps {
  project: GameProjectRecord;
  disabled?: boolean;
  onProjectChanged: () => Promise<void> | void;
  onOpenExportCenter: (initialOptions: Partial<ExportOptions>) => void;
}

export function SoundPackSnapshotPanel({
  project,
  disabled = false,
  onProjectChanged,
  onOpenExportCenter,
}: SoundPackSnapshotPanelProps): JSX.Element {
  const { t, format } = useI18n();
  const [snapshots, setSnapshots] = useState<SoundPackSnapshotRecord[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [diff, setDiff] = useState<SoundPackDiffResult | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<SoundPackRollbackPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0] ?? null,
    [selectedSnapshotId, snapshots],
  );
  const baselineSnapshot = snapshots.find((snapshot) => snapshot.id === project.baselineSnapshotId) ?? null;

  useEffect(() => {
    void loadSnapshots();
  }, [project.id]);

  async function loadSnapshots(): Promise<void> {
    const nextSnapshots = await window.suwolAudio.soundSnapshots.list(project.id);
    setSnapshots(nextSnapshots);
    setSelectedSnapshotId((current) => current && nextSnapshots.some((snapshot) => snapshot.id === current) ? current : nextSnapshots[0]?.id ?? "");
  }

  async function runTask(task: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("soundBoard.snapshot.errorGeneric" as MessageKey));
    } finally {
      setBusy(false);
    }
  }

  async function createSnapshot(): Promise<void> {
    const name = window.prompt(t("soundBoard.snapshot.namePrompt" as MessageKey), `${project.name} Snapshot`);
    if (!name?.trim()) {
      return;
    }
    const snapshot = await window.suwolAudio.soundSnapshots.create({ projectId: project.id, name });
    await loadSnapshots();
    setSelectedSnapshotId(snapshot.id);
    setMessage(t("soundBoard.snapshot.created" as MessageKey));
  }

  async function freezeSnapshot(): Promise<void> {
    if (!selectedSnapshot) {
      return;
    }
    await window.suwolAudio.soundSnapshots.freeze(selectedSnapshot.id);
    await loadSnapshots();
    setMessage(t("soundBoard.snapshot.frozen" as MessageKey));
  }

  async function setBaseline(): Promise<void> {
    if (!selectedSnapshot) {
      return;
    }
    await window.suwolAudio.soundSnapshots.setBaseline(selectedSnapshot.id);
    await Promise.all([loadSnapshots(), Promise.resolve(onProjectChanged())]);
    setMessage(t("soundBoard.snapshot.baselineSet" as MessageKey));
  }

  async function compareCurrent(): Promise<void> {
    if (!selectedSnapshot) {
      return;
    }
    const nextDiff = await window.suwolAudio.soundSnapshots.compareCurrent({
      projectId: project.id,
      fromSnapshotId: selectedSnapshot.id,
    });
    setDiff(nextDiff);
    setRollbackPreview(null);
  }

  async function previewRollback(): Promise<void> {
    if (!selectedSnapshot) {
      return;
    }
    const preview = await window.suwolAudio.soundSnapshots.rollbackPreview(selectedSnapshot.id);
    setRollbackPreview(preview);
    setDiff(null);
  }

  async function applyRollback(): Promise<void> {
    if (!rollbackPreview || !window.confirm(t("soundBoard.snapshot.rollbackConfirm" as MessageKey))) {
      return;
    }
    const result = await window.suwolAudio.soundSnapshots.rollbackApply({
      snapshotId: rollbackPreview.snapshotId,
      confirmed: true,
    });
    await Promise.all([loadSnapshots(), Promise.resolve(onProjectChanged())]);
    setRollbackPreview(result);
    setMessage(t("soundBoard.snapshot.rollbackApplied" as MessageKey, {
      count: format.number(result.updatedUsageItems),
    }));
  }

  function openSnapshotExport(): void {
    onOpenExportCenter({
      target: "sound_pack_snapshot_json",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      snapshotId: selectedSnapshot?.id,
    });
  }

  function openChangelogExport(): void {
    const fromSnapshotId = selectedSnapshot?.id ?? project.baselineSnapshotId ?? undefined;
    onOpenExportCenter({
      target: "sound_pack_changelog_markdown",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      fromSnapshotId,
      compareToCurrent: true,
      includeDiffSummary: true,
      includeCandidateChanges: true,
      includeRightsChanges: true,
      includeRiskChanges: true,
    });
  }

  return (
    <section className="sound-export-panel sound-snapshot-panel">
      <div className="section-heading-row">
        <div>
          <h3>{t("soundBoard.snapshot.title" as MessageKey)}</h3>
          <p className="muted">
            {baselineSnapshot
              ? t("soundBoard.snapshot.baselineLabel" as MessageKey, { name: baselineSnapshot.name })
              : t("soundBoard.snapshot.noBaseline" as MessageKey)}
          </p>
        </div>
        <button className="primary-button compact" type="button" disabled={disabled || busy} onClick={() => void runTask(createSnapshot)}>
          <Save size={14} aria-hidden="true" />
          {t("soundBoard.snapshot.create" as MessageKey)}
        </button>
      </div>

      <div className="sound-export-actions">
        <select value={selectedSnapshot?.id ?? ""} disabled={disabled || busy || snapshots.length === 0} onChange={(event) => setSelectedSnapshotId(event.target.value)}>
          {snapshots.length === 0 ? <option value="">{t("soundBoard.snapshot.empty" as MessageKey)}</option> : null}
          {snapshots.map((snapshot) => (
            <option key={snapshot.id} value={snapshot.id}>
              {snapshot.name}
            </option>
          ))}
        </select>
        <button className="secondary-button compact" type="button" disabled={!selectedSnapshot || selectedSnapshot.frozen || disabled || busy} onClick={() => void runTask(freezeSnapshot)}>
          <Lock size={14} aria-hidden="true" />
          {t("soundBoard.snapshot.freeze" as MessageKey)}
        </button>
        <button className="secondary-button compact" type="button" disabled={!selectedSnapshot || disabled || busy} onClick={() => void runTask(setBaseline)}>
          <Check size={14} aria-hidden="true" />
          {t("soundBoard.snapshot.setBaseline" as MessageKey)}
        </button>
      </div>

      {selectedSnapshot ? (
        <div className="snapshot-summary">
          <span>{format.dateTime(selectedSnapshot.createdAt)}</span>
          <span>{t("soundBoard.snapshot.items" as MessageKey, { count: format.number(selectedSnapshot.itemCount) })}</span>
          <span>{t("soundBoard.snapshot.selected" as MessageKey, { count: format.number(selectedSnapshot.selectedCount) })}</span>
          <span>{t("soundBoard.snapshot.approved" as MessageKey, { count: format.number(selectedSnapshot.approvedCount) })}</span>
          {selectedSnapshot.frozen ? <span className="status-badge status-approved">{t("soundBoard.snapshot.locked" as MessageKey)}</span> : null}
        </div>
      ) : null}

      <div className="sound-export-actions">
        <button className="secondary-button compact" type="button" disabled={!selectedSnapshot || disabled || busy} onClick={() => void runTask(compareCurrent)}>
          <GitCompareArrows size={14} aria-hidden="true" />
          {t("soundBoard.snapshot.compareCurrent" as MessageKey)}
        </button>
        <button className="secondary-button compact" type="button" disabled={!selectedSnapshot || disabled || busy} onClick={() => void runTask(previewRollback)}>
          <RotateCcw size={14} aria-hidden="true" />
          {t("soundBoard.snapshot.rollbackPreview" as MessageKey)}
        </button>
        <button className="secondary-button compact" type="button" disabled={!selectedSnapshot || disabled || busy} onClick={openSnapshotExport}>
          <Download size={14} aria-hidden="true" />
          {t("soundBoard.snapshot.exportJson" as MessageKey)}
        </button>
        <button className="secondary-button compact" type="button" disabled={!selectedSnapshot || disabled || busy} onClick={openChangelogExport}>
          {t("soundBoard.snapshot.changelog" as MessageKey)}
        </button>
      </div>

      {diff ? (
        <div className="snapshot-summary">
          <span>{t("soundBoard.snapshot.diffChanges" as MessageKey, { count: format.number(diff.changes.length) })}</span>
          <span>{t("soundBoard.snapshot.diffBreaking" as MessageKey, { count: format.number(diff.summary.breakingChanges) })}</span>
          <span>{t("soundBoard.snapshot.diffSelections" as MessageKey, { count: format.number(diff.summary.selectionChanges) })}</span>
        </div>
      ) : null}

      {rollbackPreview ? (
        <div className="snapshot-summary">
          <span>{t("soundBoard.snapshot.rollbackChanges" as MessageKey, { count: format.number(rollbackPreview.changes.length) })}</span>
          <span>{t("soundBoard.snapshot.rollbackSkipped" as MessageKey, { count: format.number(rollbackPreview.skippedMissingCandidates + rollbackPreview.skippedMissingUsageItems) })}</span>
          <button className="danger-button compact" type="button" disabled={!rollbackPreview.canApply || disabled || busy} onClick={() => void runTask(applyRollback)}>
            {t("soundBoard.snapshot.rollbackApply" as MessageKey)}
          </button>
        </div>
      ) : null}

      {message ? <p className="compact-status">{message}</p> : null}
    </section>
  );
}

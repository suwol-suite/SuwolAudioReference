import { ClipboardPaste, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SoundUsageBulkPreview } from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface BulkUsageImportDialogProps {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}

const SAMPLE_TEXT = `ui.button.click, UI, Button Click, high
ui.button.cancel, UI, Cancel Button, normal
combat.hit.light, SFX, Light Hit, high
bgm.battle, BGM, Battle BGM, critical, loop`;

export function BulkUsageImportDialog({ open, projectId, onClose, onDone }: BulkUsageImportDialogProps): JSX.Element | null {
  const { t, format } = useI18n();
  const [text, setText] = useState(SAMPLE_TEXT);
  const [conflictMode, setConflictMode] = useState<"skip" | "update">("skip");
  const [preview, setPreview] = useState<SoundUsageBulkPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreview(null);
  }, [open, projectId, text, conflictMode]);

  if (!open || !projectId) {
    return null;
  }

  const activeProjectId = projectId;

  async function refreshPreview(): Promise<void> {
    setBusy(true);
    try {
      setPreview(await window.suwolAudio.usage.bulkPreview({ projectId: activeProjectId, text, conflictMode }));
    } finally {
      setBusy(false);
    }
  }

  async function createRows(): Promise<void> {
    setBusy(true);
    try {
      await window.suwolAudio.usage.bulkCreate({ projectId: activeProjectId, text, conflictMode, confirmed: true });
      await onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog bulk-usage-dialog" role="dialog" aria-modal="true" aria-label={t("soundBoard.bulkAdd" as MessageKey)} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>
            <ClipboardPaste size={18} aria-hidden="true" />
            {t("soundBoard.bulkAdd" as MessageKey)}
          </h2>
          <button className="icon-button" type="button" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <label className="bulk-textarea-label">
          {t("soundBoard.pasteUsageItems" as MessageKey)}
          <textarea value={text} rows={10} onChange={(event) => setText(event.target.value)} />
        </label>
        <div className="sound-export-actions">
          <label className="toggle-chip">
            <input type="radio" checked={conflictMode === "skip"} onChange={() => setConflictMode("skip")} />
            {t("soundBoard.conflict.skip" as MessageKey)}
          </label>
          <label className="toggle-chip">
            <input type="radio" checked={conflictMode === "update"} onChange={() => setConflictMode("update")} />
            {t("soundBoard.conflict.update" as MessageKey)}
          </label>
          <button className="secondary-button compact" type="button" disabled={busy} onClick={() => void refreshPreview()}>
            {t("soundBoard.previewImport" as MessageKey)}
          </button>
          <button className="primary-button compact" type="button" disabled={busy || !preview} onClick={() => void createRows()}>
            {t("common.create")}
          </button>
        </div>
        {preview ? (
          <div className="bulk-preview">
            <p className="muted">
              {t("soundBoard.bulkSummary" as MessageKey, {
                create: format.number(preview.createCount),
                update: format.number(preview.updateCount),
                skip: format.number(preview.skipCount),
              })}
            </p>
            <div className="bulk-preview-metrics">
              <span>{t("soundBoard.bulk.valid" as MessageKey)}: {format.number(preview.validCount)}</span>
              <span>{t("soundBoard.bulk.duplicates" as MessageKey)}: {format.number(preview.duplicateCount)}</span>
              <span>{t("soundBoard.bulk.exists" as MessageKey)}: {format.number(preview.alreadyExistsCount)}</span>
              <span>{t("soundBoard.bulk.invalid" as MessageKey)}: {format.number(preview.invalidCount)}</span>
              <span>{t("soundBoard.bulk.unknownCategory" as MessageKey)}: {format.number(preview.unknownCategoryCount)}</span>
              <span>{t("soundBoard.bulk.unknownPriority" as MessageKey)}: {format.number(preview.unknownPriorityCount)}</span>
              <span>{t("soundBoard.bulk.loopDetected" as MessageKey)}: {format.number(preview.loopDetectedCount)}</span>
              <span>{t("soundBoard.bulk.comments" as MessageKey)}: {format.number(preview.commentLineCount)}</span>
              <span>{t("soundBoard.bulk.blanks" as MessageKey)}: {format.number(preview.blankLineCount)}</span>
            </div>
            <div className="bulk-preview-list">
              {preview.rows.map((row) => (
                <div key={`${row.lineNumber}-${row.suggestedKey}`} className={`bulk-preview-row action-${row.action}`}>
                  <strong>{row.suggestedKey}</strong>
                  <span>{row.displayName}</span>
                  <span>{row.category}</span>
                  <span>{row.priority}</span>
                  <em>{row.action}</em>
                  {row.warnings.length ? <small>{row.warnings.join(", ")}</small> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

import { AlertTriangle, CheckCircle2, FileOutput, FolderOpen, RefreshCw } from "lucide-react";
import type { ExportPreview, ExportRunResult } from "../../shared/export-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";
import { ProgressDialog } from "./ui/ProgressDialog";

interface ExportPreviewPanelProps {
  preview: ExportPreview | null;
  previewText: string;
  result: ExportRunResult | null;
  warningsAcknowledged: boolean;
  busy: boolean;
  onWarningsAcknowledgedChange: (value: boolean) => void;
  onPreview: () => void;
  onRun: () => void;
}

export function ExportPreviewPanel({
  preview,
  previewText,
  result,
  warningsAcknowledged,
  busy,
  onWarningsAcknowledgedChange,
  onPreview,
  onRun,
}: ExportPreviewPanelProps): JSX.Element {
  const { t, format } = useI18n();
  const errors = preview?.issues.filter((issue) => issue.severity === "error") ?? [];
  const warnings = preview?.issues.filter((issue) => issue.severity === "warning") ?? [];
  const canRun = Boolean(preview) && errors.length === 0 && (warnings.length === 0 || warningsAcknowledged);

  return (
    <section className="export-section export-preview-panel">
      <ProgressDialog open={busy} title={t("export.progress")} message={t("export.preview")} />
      <header>
        <h3>{t("export.preview")}</h3>
        <button className="secondary-button compact" type="button" disabled={busy} onClick={onPreview}>
          <RefreshCw size={15} aria-hidden="true" />
          {t("export.refreshPreview")}
        </button>
      </header>

      {preview ? (
        <>
          <div className={preview.ok ? "export-status ok" : "export-status warn"}>
            {preview.ok ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
            {t("export.previewSummary", {
              count: format.number(preview.assetCount),
              issues: format.number(preview.issues.length),
            })}
          </div>

          {preview.issues.length > 0 ? (
            <ul className="export-issue-list">
              {preview.issues.slice(0, 8).map((issue, index) => (
                <li key={`${issue.code}-${issue.assetId ?? index}`} className={`issue-${issue.severity}`}>
                  <strong>{t(`export.severity.${issue.severity}` as MessageKey)}</strong>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {warnings.length > 0 ? (
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={warningsAcknowledged}
                onChange={(event) => onWarningsAcknowledgedChange(event.target.checked)}
              />
              {t("export.ackWarnings")}
            </label>
          ) : null}

          <div className="export-file-list">
            {preview.plannedFiles.slice(0, 8).map((file) => (
              <span key={file.path}>{file.path}</span>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">{t("export.previewEmpty")}</p>
      )}

      {previewText ? <textarea className="export-preview-text" readOnly rows={8} value={previewText} /> : null}

      <button className="primary-button compact" type="button" disabled={!canRun || busy} onClick={onRun}>
        <FileOutput size={15} aria-hidden="true" />
        {t("export.run")}
      </button>

      {result ? (
        <div className={result.ok ? "compact-status export-result" : "compact-status error-text export-result"}>
          <span>
            {result.ok
              ? t("export.completed", { path: result.outputPath ?? "" })
              : t("export.failed", { message: result.error?.message ?? "" })}
          </span>
          {result.ok && result.outputPath ? (
            <button className="secondary-button compact" type="button" onClick={() => void window.suwolAudio.export.showOutputPath(result.outputPath!)}>
              <FolderOpen size={15} aria-hidden="true" />
              {t("export.openOutput")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

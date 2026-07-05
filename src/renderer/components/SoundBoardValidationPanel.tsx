import { AlertTriangle, CheckCircle2, Clipboard, Wand2 } from "lucide-react";
import type { SoundBoardValidationIssue, SoundBoardValidationResult } from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface SoundBoardValidationPanelProps {
  validation: SoundBoardValidationResult | null;
  onSelectIssue: (usageItemId: string) => void;
  onApplySuggestedKey: (usageItemId: string, suggestedKey?: string) => void;
}

export function SoundBoardValidationPanel({
  validation,
  onSelectIssue,
  onApplySuggestedKey,
}: SoundBoardValidationPanelProps): JSX.Element {
  const { t } = useI18n();
  if (!validation) {
    return <p className="muted">{t("soundBoard.validation.empty" as MessageKey)}</p>;
  }
  const issues = validation.issues.filter((issue) => issue.severity !== "info").slice(0, 12);
  return (
    <section className="sound-detail-section validation-panel">
      <div className="sound-panel-header">
        <h3>{t("soundBoard.validation" as MessageKey)}</h3>
        <span className={validation.ok ? "mini-status ok" : "mini-status warn"}>
          {validation.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
          {validation.ok ? t("diagnostics.ok") : t("soundBoard.risk" as MessageKey)}
        </span>
      </div>
      {issues.length === 0 ? <p className="muted">{t("soundBoard.validation.ok" as MessageKey)}</p> : null}
      <div className="validation-issue-list">
        {issues.map((issue) => (
          <ValidationIssueRow
            key={issue.id}
            issue={issue}
            onSelectIssue={onSelectIssue}
            onApplySuggestedKey={onApplySuggestedKey}
          />
        ))}
      </div>
    </section>
  );
}

function ValidationIssueRow({
  issue,
  onSelectIssue,
  onApplySuggestedKey,
}: {
  issue: SoundBoardValidationIssue;
  onSelectIssue: (usageItemId: string) => void;
  onApplySuggestedKey: (usageItemId: string, suggestedKey?: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className={`validation-issue issue-${issue.severity}`}>
      <button type="button" onClick={() => issue.usageItemId && onSelectIssue(issue.usageItemId)}>
        <strong>{issue.usageKey ?? issue.code}</strong>
        <em>{t(`soundBoard.issue.${issue.code}` as MessageKey)} / {t(`export.severity.${issue.severity}` as MessageKey)}</em>
        <span>{issue.message}</span>
      </button>
      {issue.suggestedKey ? (
        <button
          className="icon-button"
          type="button"
          onClick={() => void navigator.clipboard?.writeText(issue.suggestedKey ?? "")}
          title={t("soundBoard.copySuggestedKey" as MessageKey)}
          aria-label={t("soundBoard.copySuggestedKey" as MessageKey)}
        >
          <Clipboard size={14} aria-hidden="true" />
        </button>
      ) : null}
      {issue.code === "KEY_INVALID" && issue.usageItemId ? (
        <button
          className="icon-button"
          type="button"
          onClick={() => onApplySuggestedKey(issue.usageItemId!, issue.suggestedKey)}
          title={t("soundBoard.applySuggestedKey" as MessageKey)}
          aria-label={t("soundBoard.applySuggestedKey" as MessageKey)}
        >
          <Wand2 size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

import type { SoundBoardValidationResult, SoundUsageRiskFilter } from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface SoundBoardDashboardProps {
  validation: SoundBoardValidationResult | null;
  activeFilter: SoundUsageRiskFilter;
  onFilter: (filter: SoundUsageRiskFilter) => void;
  onClearFilter: () => void;
}

export function SoundBoardDashboard({
  validation,
  activeFilter,
  onFilter,
  onClearFilter,
}: SoundBoardDashboardProps): JSX.Element | null {
  const { t, format } = useI18n();
  if (!validation) {
    return null;
  }
  const dashboard = validation.dashboard;
  const cards = [
    { key: "total", value: dashboard.total, filter: "all" },
    { key: "required", value: dashboard.required, filter: "required" },
    { key: "missing", value: dashboard.missing, filter: "missing_required" },
    { key: "noCandidates", value: dashboard.noCandidates, filter: "no_candidates" },
    { key: "needsReview", value: dashboard.needsReview, filter: "candidates_no_selected" },
    { key: "selected", value: dashboard.selected, filter: "selected_not_approved" },
    { key: "approved", value: dashboard.approved, filter: "approved" },
    { key: "risks", value: dashboard.risks, filter: "has_risks" },
  ] as const;
  return (
    <section className="sound-board-dashboard" aria-label={t("soundBoard.dashboard" as MessageKey)}>
      {cards.map((card) => (
        <button
          key={card.key}
          className={activeFilter === card.filter ? "is-active" : ""}
          type="button"
          onClick={() => onFilter(card.filter)}
        >
          <span>{t(`soundBoard.dashboard.${card.key}` as MessageKey)}</span>
          <strong>{format.number(card.value)}</strong>
        </button>
      ))}
      <div className="sound-risk-strip">
        <span>{t("soundBoard.activeFilter" as MessageKey)}: {t(`soundBoard.filter.${activeFilter}` as MessageKey)}</span>
        {activeFilter !== "all" ? (
          <button type="button" onClick={onClearFilter}>
            {t("soundBoard.clearFilter" as MessageKey)}
          </button>
        ) : null}
        <button className={activeFilter === "unknown_license_selected" ? "is-active" : ""} type="button" onClick={() => onFilter("unknown_license_selected")}>
          {t("soundBoard.risk.unknownLicense" as MessageKey)}: {format.number(dashboard.unknownLicenseSelected)}
        </button>
        <button className={activeFilter === "loop_mismatch" ? "is-active" : ""} type="button" onClick={() => onFilter("loop_mismatch")}>
          {t("soundBoard.risk.loopMismatch" as MessageKey)}: {format.number(dashboard.loopWarnings)}
        </button>
        <button className={activeFilter === "playback_unsupported_selected" ? "is-active" : ""} type="button" onClick={() => onFilter("playback_unsupported_selected")}>
          {t("soundBoard.risk.playbackUnsupported" as MessageKey)}: {format.number(dashboard.playbackUnsupportedSelected)}
        </button>
        <button className={activeFilter === "missing_file_selected" ? "is-active" : ""} type="button" onClick={() => onFilter("missing_file_selected")}>
          {t("soundBoard.risk.missingFile" as MessageKey)}: {format.number(dashboard.missingFileSelected)}
        </button>
      </div>
    </section>
  );
}

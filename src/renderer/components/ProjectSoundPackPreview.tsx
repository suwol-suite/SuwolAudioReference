import { FolderOpen } from "lucide-react";
import type { ProjectSoundPackDryRun, ProjectSoundPackExportResult } from "../../shared/project-sound-pack-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface ProjectSoundPackPreviewProps {
  preview: ProjectSoundPackDryRun | null;
  result: ProjectSoundPackExportResult | null;
  onOpenOutput: (outputPath: string) => void;
}

export function ProjectSoundPackPreview({
  preview,
  result,
  onOpenOutput,
}: ProjectSoundPackPreviewProps): JSX.Element | null {
  const { t, format } = useI18n();
  if (!preview) {
    return null;
  }
  return (
    <div className={preview.ok ? "sound-export-summary project-sound-pack-preview" : "sound-export-summary project-sound-pack-preview has-warning"}>
      <div>
        <strong>{t("projectSoundPack.preview" as MessageKey)}</strong>
        <span>{preview.projectName}</span>
        <span>{t(`soundBoard.engine.${preview.engineProfile}` as MessageKey)}</span>
      </div>
      <dl>
        <Metric label={t("projectSoundPack.usageItems" as MessageKey)} value={format.number(preview.summary.requestedUsageItems)} />
        <Metric label={t("projectSoundPack.includedItems" as MessageKey)} value={format.number(preview.summary.includedUsageItems)} />
        <Metric label={t("projectSoundPack.filesToCopy" as MessageKey)} value={format.number(preview.summary.filesToCopy)} />
        <Metric label={t("projectSoundPack.approvedSelected" as MessageKey)} value={format.number(preview.summary.approvedSelectedCount)} />
        <Metric label={t("projectSoundPack.skippedMissing" as MessageKey)} value={format.number(preview.summary.skippedMissingFiles)} />
        <Metric label={t("projectSoundPack.skippedRejected" as MessageKey)} value={format.number(preview.summary.skippedRejectedCandidates)} />
        <Metric label={t("projectSoundPack.unknownLicense" as MessageKey)} value={format.number(preview.summary.unknownLicenseCount)} />
        <Metric label={t("projectSoundPack.creditRequired" as MessageKey)} value={format.number(preview.summary.creditRequiredCount)} />
        <Metric label={t("projectSoundPack.renameCount" as MessageKey)} value={format.number(preview.summary.renameCount)} />
        <Metric label={t("projectSoundPack.duplicateOutput" as MessageKey)} value={format.number(preview.summary.duplicateOutputFilenameCount)} />
        <Metric label={t("projectSoundPack.errors" as MessageKey)} value={format.number(preview.summary.validationErrorCount)} />
        <Metric label={t("projectSoundPack.warnings" as MessageKey)} value={format.number(preview.summary.validationWarningCount)} />
      </dl>
      <div className="planned-file-list">
        <span>{t("projectSoundPack.outputFolder" as MessageKey)}: {preview.outputRoot}</span>
        {preview.outputTree.slice(0, 12).map((path) => (
          <span key={path}>{path}</span>
        ))}
        {preview.outputTree.length > 12 ? <span>+{format.number(preview.outputTree.length - 12)}</span> : null}
      </div>
      {preview.errors.length || preview.warnings.length ? (
        <div className="inline-warning-list">
          {[...preview.errors, ...preview.warnings].slice(0, 6).map((issue, index) => (
            <span key={`${issue.code}-${issue.assetId ?? issue.usageItemId ?? index}`} className={`status-badge issue-${issue.severity}`}>
              {t(`projectSoundPack.issue.${issue.code}` as MessageKey)}
            </span>
          ))}
        </div>
      ) : null}
      {result ? (
        <p className={result.ok ? "compact-status" : "compact-status error-text"}>
          {result.ok ? t("projectSoundPack.complete" as MessageKey, { path: result.outputPath ?? "" }) : result.error?.message}
          {result.ok && result.outputPath ? (
            <button className="secondary-button compact" type="button" onClick={() => onOpenOutput(result.outputPath!)}>
              <FolderOpen size={14} aria-hidden="true" />
              {t("projectSoundPack.openOutput" as MessageKey)}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

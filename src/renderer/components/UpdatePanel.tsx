import { CheckCircle2, Download, ExternalLink, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ReleaseAssetExpectation,
  ReleaseAssetKind,
  ReleaseDistributionKind,
  ReleaseStatus,
} from "../../shared/release-status-types";
import type { AppSettings } from "../../shared/settings-types";
import type { UpdatePlatformSupport, UpdateState, UpdateStatus } from "../../shared/update-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";
import { ChecksumHelpPanel } from "./ChecksumHelpPanel";

interface UpdatePanelProps {
  settings: AppSettings;
  onSettingsChanged?: (settings: AppSettings) => void;
}

export function UpdatePanel({ settings, onSettingsChanged }: UpdatePanelProps): JSX.Element {
  const { t, format } = useI18n();
  const [state, setState] = useState<UpdateState | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus | null>(null);
  const [releaseStatusLoadFailed, setReleaseStatusLoadFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    void window.suwolAudio.updates.getState().then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    void window.suwolAudio.releaseStatus
      .get()
      .then((next) => {
        if (mounted) {
          setReleaseStatus(next);
          setReleaseStatusLoadFailed(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setReleaseStatusLoadFailed(true);
        }
      });
    const unsubscribe = window.suwolAudio.updates.onStateChanged((next) => setState(next));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function run(action: "check" | "download" | "install"): Promise<void> {
    const next = await window.suwolAudio.updates[action]();
    setState(next);
  }

  async function runReleaseAction(action: "openReleases" | "openLatestRelease" | "openChecksumsHelp"): Promise<void> {
    const next = await window.suwolAudio.releaseStatus[action]();
    setReleaseStatus(next);
  }

  async function updateSettings(input: Partial<AppSettings["updates"]>): Promise<void> {
    const next = await window.suwolAudio.settings.updateUpdates(input);
    onSettingsChanged?.(next);
  }

  const resolvedState =
    state ??
    ({
      supported: false,
      supportReason: "dev_mode",
      status: "disabled",
      currentVersion: "",
    } satisfies UpdateState);
  const busy = resolvedState.status === "checking" || resolvedState.status === "downloading";
  const canCheck = resolvedState.supported && !busy;
  const canDownload = resolvedState.supported && resolvedState.status === "available" && !busy;
  const canInstall = resolvedState.supported && resolvedState.status === "downloaded";
  const releaseStatusErrorCode =
    releaseStatus?.lastErrorCode ?? (releaseStatusLoadFailed ? "RELEASE_STATUS_LOAD_FAILED" : undefined);
  const currentVersion = releaseStatus?.currentVersion ?? resolvedState.currentVersion;

  return (
    <div className="settings-section update-panel">
      <div className="section-heading-row">
        <div>
          <h3>{t("updates.releaseStatus")}</h3>
          <p className="muted">{t(getUpdateSupportMessageKey(resolvedState.supportReason, resolvedState.supported))}</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={() => void runReleaseAction("openReleases")}>
          <ExternalLink size={15} aria-hidden="true" />
          {t("updates.openReleasePage")}
        </button>
      </div>

      {releaseStatusErrorCode ? <p className="error-text">{t(`error.${releaseStatusErrorCode}` as MessageKey)}</p> : null}

      <section className="update-subsection">
        <h4>{t("updates.currentApp")}</h4>
        <dl className="diagnostics-grid update-state-grid">
          <Metric label={t("updates.currentVersion")} value={currentVersion || t("common.unknown")} />
          <Metric label={t("updates.platform")} value={releaseStatus?.platform ?? t("common.unknown")} />
          <Metric
            label={t("updates.distributionType")}
            value={releaseStatus ? t(getReleaseDistributionLabelKey(releaseStatus.distributionKind)) : t("common.unknown")}
          />
          <Metric
            label={t("updates.publicKey")}
            value={releaseStatus?.publicKey.available ? t("updates.publicKeyAvailable") : t("updates.publicKeyMissing")}
          />
        </dl>
      </section>

      <section className="update-subsection">
        <div className="update-subsection-heading">
          <h4>{t("updates.autoUpdate")}</h4>
          <span className={resolvedState.supported ? "compact-status positive" : "compact-status neutral"}>
            {resolvedState.supported ? t("updates.autoUpdateSupported") : t("updates.autoUpdateNotSupported")}
          </span>
        </div>
        <dl className="diagnostics-grid update-state-grid">
          <Metric label={t("updates.status")} value={t(getUpdateStatusKey(resolvedState.status))} />
          <Metric label={t("updates.availableVersion")} value={resolvedState.availableVersion ?? t("common.unknown")} />
          <Metric label={t("updates.downloadedVersion")} value={resolvedState.downloadedVersion ?? t("common.unknown")} />
          <Metric label={t("updates.autoUpdatePolicy")} value={t(getReleaseAutoUpdatePolicyKey(releaseStatus?.distributionKind, resolvedState.supported))} />
        </dl>
      </section>

      {resolvedState.progress ? (
        <div className="update-progress" role="status" aria-live="polite">
          <div>
            <span>{t("updates.downloadProgress")}</span>
            <strong>{format.number(Math.round(resolvedState.progress.percent))}%</strong>
          </div>
          <progress value={resolvedState.progress.percent} max={100} />
          <small>
            {formatBytes(resolvedState.progress.transferred)} / {formatBytes(resolvedState.progress.total)}
            {" · "}
            {formatBytes(resolvedState.progress.bytesPerSecond)}/s
          </small>
        </div>
      ) : null}

      {resolvedState.errorCode ? (
        <p className="error-text">
          {t(`error.${resolvedState.errorCode}` as MessageKey)}
          {resolvedState.errorMessage ? ` (${resolvedState.errorMessage})` : ""}
        </p>
      ) : null}

      <div className="management-actions">
        <button className="secondary-button compact" type="button" onClick={() => void run("check")} disabled={!canCheck}>
          <RefreshCw size={15} aria-hidden="true" />
          {t("updates.check")}
        </button>
        <button className="secondary-button compact" type="button" onClick={() => void run("download")} disabled={!canDownload}>
          <Download size={15} aria-hidden="true" />
          {t("updates.download")}
        </button>
        <button className="primary-button compact" type="button" onClick={() => void run("install")} disabled={!canInstall}>
          <RotateCcw size={15} aria-hidden="true" />
          {t("updates.restartToUpdate")}
        </button>
      </div>

      <div className="update-settings">
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.updates.checkOnStartup}
            onChange={(event) => void updateSettings({ checkOnStartup: event.target.checked })}
          />
          {t("updates.checkOnStartup")}
        </label>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.updates.autoDownload}
            onChange={(event) => void updateSettings({ autoDownload: event.target.checked })}
          />
          {t("updates.autoDownload")}
        </label>
        <p className="muted">{t("updates.settingsPolicy")}</p>
      </div>

      {releaseStatus ? (
        <>
          <section className="update-subsection">
            <div className="update-subsection-heading">
              <h4>{t("updates.manualDownload")}</h4>
              <span className="compact-status neutral">{t("updates.manualDownloadRequired")}</span>
            </div>
            <div className="management-actions">
              <button className="secondary-button compact" type="button" onClick={() => void runReleaseAction("openLatestRelease")}>
                <ExternalLink size={15} aria-hidden="true" />
                {t("updates.openLatestRelease")}
              </button>
              <button className="secondary-button compact" type="button" onClick={() => void runReleaseAction("openReleases")}>
                <ExternalLink size={15} aria-hidden="true" />
                {t("updates.openReleasePage")}
              </button>
              <button className="secondary-button compact" type="button" onClick={() => void runReleaseAction("openChecksumsHelp")}>
                <ShieldCheck size={15} aria-hidden="true" />
                {t("updates.openChecksumHelp")}
              </button>
            </div>
          </section>

          <section className="update-subsection">
            <h4>{t("updates.releaseAssets")}</h4>
            <div className="release-assets-list" aria-label={t("updates.expectedAssets")}>
              {releaseStatus.expectedAssets.map((asset) => (
                <ReleaseAssetRow asset={asset} key={`${asset.kind}:${asset.fileName}`} />
              ))}
            </div>
          </section>

          <section className="update-subsection">
            <h4>{t("updates.checksumVerification")}</h4>
            <ChecksumHelpPanel status={releaseStatus} />
          </section>

          <section className="update-subsection">
            <h4>{t("updates.knownLimits")}</h4>
            <ul className="release-notes-list">
              <li>{t("updates.autoUpdateOnlyAppImage")}</li>
              <li>{t("updates.windowsManualUpdate")}</li>
              <li>{t("updates.linuxZipManualUpdate")}</li>
              <li>{t("updates.noCodeSigning")}</li>
              <li>{t("updates.developmentMode")}</li>
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

export function getUpdateSupportMessageKey(reason: UpdatePlatformSupport, supported: boolean): MessageKey {
  if (supported) {
    return "updates.supportedLinuxAppImage";
  }
  if (reason === "dev_mode") {
    return "updates.devMode";
  }
  if (reason === "unsupported_package") {
    return "updates.linuxZipManual";
  }
  return "updates.windowsManual";
}

export function getUpdateStatusKey(status: UpdateStatus): MessageKey {
  return `updates.status.${status}` as MessageKey;
}

export function getReleaseDistributionLabelKey(kind: ReleaseDistributionKind): MessageKey {
  return `updates.distribution.${kind}` as MessageKey;
}

export function getReleaseAutoUpdatePolicyKey(kind: ReleaseDistributionKind | undefined, supported: boolean): MessageKey {
  if (supported || kind === "linux_appimage") {
    return "updates.linuxAppImageAutoUpdate";
  }
  if (kind === "development") {
    return "updates.developmentMode";
  }
  if (kind === "windows_zip") {
    return "updates.windowsManualUpdate";
  }
  return "updates.linuxZipManualUpdate";
}

export function getReleaseAssetLabelKey(kind: ReleaseAssetKind): MessageKey {
  return `updates.asset.${kind}` as MessageKey;
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReleaseAssetRow({ asset }: { asset: ReleaseAssetExpectation }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="release-asset-row">
      <CheckCircle2 size={14} aria-hidden="true" />
      <span>{t(getReleaseAssetLabelKey(asset.kind))}</span>
      <code>{asset.fileName}</code>
    </div>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

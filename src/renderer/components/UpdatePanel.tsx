import { Download, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppSettings } from "../../shared/settings-types";
import type { UpdatePlatformSupport, UpdateState, UpdateStatus } from "../../shared/update-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface UpdatePanelProps {
  settings: AppSettings;
  onSettingsChanged?: (settings: AppSettings) => void;
}

export function UpdatePanel({ settings, onSettingsChanged }: UpdatePanelProps): JSX.Element {
  const { t, format } = useI18n();
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    let mounted = true;
    void window.suwolAudio.updates.getState().then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    const unsubscribe = window.suwolAudio.updates.onStateChanged((next) => setState(next));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function run(action: "check" | "download" | "install" | "openReleasePage"): Promise<void> {
    const next = await window.suwolAudio.updates[action]();
    setState(next);
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

  return (
    <div className="settings-section update-panel">
      <div className="section-heading-row">
        <div>
          <h3>{t("updates.title")}</h3>
          <p className="muted">{t(getUpdateSupportMessageKey(resolvedState.supportReason, resolvedState.supported))}</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={() => void run("openReleasePage")}>
          <ExternalLink size={15} aria-hidden="true" />
          {t("updates.openReleasePage")}
        </button>
      </div>

      <dl className="diagnostics-grid update-state-grid">
        <Metric label={t("updates.currentVersion")} value={resolvedState.currentVersion || t("common.unknown")} />
        <Metric label={t("updates.status")} value={t(getUpdateStatusKey(resolvedState.status))} />
        <Metric label={t("updates.availableVersion")} value={resolvedState.availableVersion ?? t("common.unknown")} />
        <Metric label={t("updates.downloadedVersion")} value={resolvedState.downloadedVersion ?? t("common.unknown")} />
      </dl>

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
    return "updates.linuxTarManual";
  }
  return "updates.windowsManual";
}

export function getUpdateStatusKey(status: UpdateStatus): MessageKey {
  return `updates.status.${status}` as MessageKey;
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
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

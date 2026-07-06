import { FolderOpen, List, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  APP_KNOWN_ISSUES_DOC,
  APP_LINUX_DISTRIBUTION_DOC,
  APP_LICENSE,
  APP_RELEASE_NOTES_DOC,
  APP_VERSION,
  APP_WINDOWS_DISTRIBUTION_DOC,
} from "../../shared/app-metadata";
import type { LibraryDiagnostics } from "../../shared/library-types";
import type { AppSettings } from "../../shared/settings-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";
import { LanguageSelect } from "./LanguageSelect";
import { LibraryManagementPanel } from "./LibraryManagementPanel";
import { UpdatePanel } from "./UpdatePanel";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onSettingsChanged?: (settings: AppSettings) => void;
  selectedAssetIds?: string[];
}

type SettingsTab = "general" | "playback" | "updates" | "library" | "shortcuts" | "about";

const SETTINGS_TABS: SettingsTab[] = ["general", "playback", "updates", "library", "shortcuts", "about"];

export function SettingsDialog({
  open,
  onClose,
  onSettingsChanged,
  selectedAssetIds = [],
}: SettingsDialogProps): JSX.Element | null {
  const { t, format } = useI18n();
  const [diagnostics, setDiagnostics] = useState<LibraryDiagnostics | null | undefined>(undefined);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [logLines, setLogLines] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      void window.suwolAudio.settings.get().then(setSettings);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  async function runDiagnostics(): Promise<void> {
    setDiagnostics(await window.suwolAudio.diagnostics.runLibraryDiagnostics());
  }

  async function openLogFolder(): Promise<void> {
    await window.suwolAudio.diagnostics.openLogFolder();
  }

  async function loadRecentLogs(): Promise<void> {
    setLogLines(await window.suwolAudio.diagnostics.recentLogs(40));
  }

  async function updateQuickPreview(input: Partial<AppSettings>): Promise<void> {
    const next = await window.suwolAudio.settings.updateQuickPreview(input);
    setSettings(next);
    onSettingsChanged?.(next);
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.title")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{t("settings.title")}</h2>
          <button className="icon-button" type="button" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <nav className="settings-tabs" aria-label={t("settings.title")}>
          {SETTINGS_TABS.map((tab) => (
            <button className={activeTab === tab ? "is-selected" : ""} key={tab} type="button" onClick={() => setActiveTab(tab)}>
              {t(`settings.tab.${tab}` as MessageKey)}
            </button>
          ))}
        </nav>

        {activeTab === "general" ? (
          <div className="settings-section">
            <LanguageSelect />
          </div>
        ) : null}

        {activeTab === "playback" && settings ? (
          <div className="settings-section">
            <h3>{t("quickPreview.title")}</h3>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.quickPreviewEnabled}
                onChange={(event) => void updateQuickPreview({ quickPreviewEnabled: event.target.checked })}
              />
              {t("quickPreview.enabled")}
            </label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.quickPreviewAutoPlayShortSounds}
                onChange={(event) => void updateQuickPreview({ quickPreviewAutoPlayShortSounds: event.target.checked })}
              />
              {t("quickPreview.autoPlayShortSounds")}
            </label>
            <label className="settings-row">
              {t("quickPreview.maxDuration")}
              <input
                type="number"
                min={300}
                max={15000}
                step={100}
                value={settings.quickPreviewMaxDurationMs}
                onChange={(event) => void updateQuickPreview({ quickPreviewMaxDurationMs: Number(event.target.value) })}
              />
            </label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.stopPreviousOnSelectionChange}
                onChange={(event) => void updateQuickPreview({ stopPreviousOnSelectionChange: event.target.checked })}
              />
              {t("quickPreview.stopPrevious")}
            </label>
          </div>
        ) : null}

        {activeTab === "updates" && settings ? (
          <UpdatePanel settings={settings} onSettingsChanged={(next) => {
            setSettings(next);
            onSettingsChanged?.(next);
          }} />
        ) : null}

        {activeTab === "library" ? (
          <>
            <div className="settings-section">
              <h3>{t("diagnostics.title")}</h3>
              <div className="management-actions">
                <button className="secondary-button compact" type="button" onClick={runDiagnostics}>
                  {t("diagnostics.run")}
                </button>
                <button className="secondary-button compact" type="button" onClick={() => void openLogFolder()}>
                  <FolderOpen size={15} aria-hidden="true" />
                  {t("diagnostics.openLogFolder" as MessageKey)}
                </button>
                <button className="secondary-button compact" type="button" onClick={() => void loadRecentLogs()}>
                  <List size={15} aria-hidden="true" />
                  {t("diagnostics.showRecentLogs" as MessageKey)}
                </button>
              </div>
              {diagnostics === null ? <p className="muted">{t("diagnostics.noLibrary")}</p> : null}
              {diagnostics ? (
                <dl className="diagnostics-grid">
                  <Metric label={t("diagnostics.ok")} value={diagnostics.ok ? t("diagnostics.ok") : t("common.failed")} />
                  <Metric label={t("diagnostics.dbIntegrity")} value={diagnostics.dbIntegrity} />
                  <Metric label={t("diagnostics.migrationVersion")} value={diagnostics.migrationVersion} />
                  <Metric label={t("diagnostics.assetCount")} value={format.number(diagnostics.assetCount)} />
                  <Metric label={t("diagnostics.missingFiles")} value={format.number(diagnostics.missingFiles)} />
                  <Metric label={t("diagnostics.analysisMissing")} value={format.number(diagnostics.analysisMissing)} />
                  <Metric label={t("diagnostics.trashedAssets")} value={format.number(diagnostics.trashedAssets)} />
                  <Metric label={t("diagnostics.duplicateHashes")} value={format.number(diagnostics.duplicateHashes)} />
                  <Metric label={t("diagnostics.importWarnings")} value={format.number(diagnostics.importWarnings)} />
                  <Metric label={t("diagnostics.logPath")} value={diagnostics.logPath} />
                </dl>
              ) : null}
              {logLines.length > 0 ? (
                <pre className="log-preview" aria-label={t("diagnostics.recentLogs" as MessageKey)}>
                  {logLines.join("\n")}
                </pre>
              ) : null}
            </div>
            <div className="settings-section">
              <h3>{t("management.title")}</h3>
              <LibraryManagementPanel
                diagnostics={diagnostics ?? null}
                onDiagnosticsChange={setDiagnostics}
                selectedAssetIds={selectedAssetIds}
              />
            </div>
          </>
        ) : null}

        {activeTab === "shortcuts" ? (
          <div className="settings-section">
            <h3>{t("shortcuts.title")}</h3>
            <dl className="shortcut-grid">
              <Metric label="Arrow keys" value={t("shortcuts.navigate")} />
              <Metric label="Enter" value={t("shortcuts.playSelected")} />
              <Metric label="Space" value={t("shortcuts.togglePlayback")} />
              <Metric label="Esc" value={t("shortcuts.stopOrClear")} />
              <Metric label="F" value={t("shortcuts.favorite")} />
              <Metric label="1-5 / 0" value={t("shortcuts.rating")} />
              <Metric label="L / A / B" value={t("shortcuts.loop")} />
              <Metric label="Ctrl+F / Cmd+F" value={t("shortcuts.focusSearch")} />
              <Metric label="Ctrl+A / Cmd+A" value={t("shortcuts.selectAll")} />
              <Metric label="Delete" value={t("shortcuts.trash")} />
              <Metric label="?" value={t("shortcuts.help" as MessageKey)} />
            </dl>
          </div>
        ) : null}

        {activeTab === "about" ? (
          <div className="settings-section">
            <h3>{t("settings.appInfo")}</h3>
            <p>
              <strong>{t("app.aboutTitle")}</strong>
              <br />
              {t("app.aboutBody")}
            </p>
            <dl className="diagnostics-grid">
              <Metric label={t("app.version" as MessageKey)} value={APP_VERSION} />
              <Metric label={t("app.licenseLabel" as MessageKey)} value={APP_LICENSE} />
              <Metric label={t("app.releaseNotes" as MessageKey)} value={APP_RELEASE_NOTES_DOC} />
              <Metric label={t("app.knownIssues" as MessageKey)} value={APP_KNOWN_ISSUES_DOC} />
              <Metric label={t("app.windowsDistribution" as MessageKey)} value={APP_WINDOWS_DISTRIBUTION_DOC} />
              <Metric label={t("app.linuxDistribution" as MessageKey)} value={APP_LINUX_DISTRIBUTION_DOC} />
            </dl>
            <button className="secondary-button compact" type="button" onClick={() => void openLogFolder()}>
              <FolderOpen size={15} aria-hidden="true" />
              {t("diagnostics.openLogFolder" as MessageKey)}
            </button>
          </div>
        ) : null}
      </section>
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

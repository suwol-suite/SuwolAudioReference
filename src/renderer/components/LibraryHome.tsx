import { FolderOpen, Library, Plus, Settings } from "lucide-react";
import { useState } from "react";
import type { RecentLibraryRecord } from "../../shared/library-types";
import { LanguageSelect } from "./LanguageSelect";
import { SettingsDialog } from "./SettingsDialog";
import { EmptyState } from "./ui/EmptyState";
import { useI18n } from "../i18n/useI18n";

interface LibraryHomeProps {
  busy: boolean;
  error: string | null;
  recentLibraries: RecentLibraryRecord[];
  onCreateLibrary: () => void;
  onOpenLibrary: () => void;
  onOpenRecent: (libraryPath: string) => void;
}

export function LibraryHome({
  busy,
  error,
  recentLibraries,
  onCreateLibrary,
  onOpenLibrary,
  onOpenRecent,
}: LibraryHomeProps): JSX.Element {
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <main className="library-home">
      <section className="home-panel">
        <div className="home-topbar">
          <LanguageSelect compact />
          <button className="icon-button" type="button" onClick={() => setSettingsOpen(true)} title={t("app.settings")} aria-label={t("app.settings")}>
            <Settings size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="home-brand">
          <Library size={30} aria-hidden="true" />
          <div>
            <h1>{t("app.name")}</h1>
            <p>{t("app.tagline")}</p>
          </div>
        </div>

        <div className="home-actions">
          <button className="primary-button" type="button" onClick={onCreateLibrary} disabled={busy} aria-label={t("library.create")}>
            <Plus size={17} aria-hidden="true" />
            {t("library.create")}
          </button>
          <button className="secondary-button" type="button" onClick={onOpenLibrary} disabled={busy} aria-label={t("library.open")}>
            <FolderOpen size={17} aria-hidden="true" />
            {t("library.open")}
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="recent-list">
          <h2>{t("library.recent")}</h2>
          {recentLibraries.length === 0 ? (
            <EmptyState title={t("library.recentEmpty")} />
          ) : (
            recentLibraries.map((library) => (
              <button
                className="recent-library-row"
                key={library.libraryPath}
                type="button"
                onClick={() => onOpenRecent(library.libraryPath)}
                disabled={busy}
              >
                <span>{library.name}</span>
                <small>{library.libraryPath}</small>
              </button>
            ))
          )}
        </div>
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </section>
    </main>
  );
}

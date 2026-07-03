import { useEffect, useState } from "react";
import type { AppErrorCode } from "../shared/app-error-codes";
import type { LibrarySnapshot, RecentLibraryRecord } from "../shared/library-types";
import { AssetBrowser } from "./components/AssetBrowser";
import { LibraryHome } from "./components/LibraryHome";
import { useI18n } from "./i18n/useI18n";

export function App(): JSX.Element {
  const { tError } = useI18n();
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [recentLibraries, setRecentLibraries] = useState<RecentLibraryRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuImportSignal, setMenuImportSignal] = useState(0);

  useEffect(() => {
    void refreshRecent();
  }, []);

  useEffect(() => {
    return window.suwolAudio.menu.onCommand((command) => {
      if (command === "library:create") {
        void createLibrary();
      }
      if (command === "library:open") {
        void openLibrary();
      }
      if (command === "assets:import") {
        setMenuImportSignal((value) => value + 1);
      }
    });
  });

  async function refreshRecent(): Promise<void> {
    setRecentLibraries(await window.suwolAudio.library.recentList());
  }

  async function createLibrary(): Promise<void> {
    await runLibraryAction(async () => window.suwolAudio.library.create(), "LIBRARY_CREATE_FAILED");
  }

  async function openLibrary(rootPath?: string): Promise<void> {
    await runLibraryAction(
      async () => window.suwolAudio.library.open(rootPath ? { rootPath } : undefined),
      "LIBRARY_OPEN_FAILED",
    );
  }

  async function runLibraryAction(action: () => Promise<LibrarySnapshot | null>, fallbackCode: AppErrorCode): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) {
        setSnapshot(next);
        await refreshRecent();
      }
    } catch {
      setError(tError(fallbackCode));
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return (
      <LibraryHome
        busy={busy}
        error={error}
        recentLibraries={recentLibraries}
        onCreateLibrary={createLibrary}
        onOpenLibrary={() => openLibrary()}
        onOpenRecent={(libraryPath) => openLibrary(libraryPath)}
      />
    );
  }

  return <AssetBrowser initialSnapshot={snapshot} onSnapshotChange={setSnapshot} menuImportSignal={menuImportSignal} />;
}

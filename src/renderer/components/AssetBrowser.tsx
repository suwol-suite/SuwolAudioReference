import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { AppSettings } from "../../shared/settings-types";
import type {
  AssetListItem,
  AssetSortOption,
  CollectionRecord,
  LibrarySnapshot,
  TagRecord,
  ViewMode,
} from "../../shared/library-types";
import {
  DEFAULT_ASSET_FILTERS,
  getActiveFilterCount,
  getNextSelectionIndex,
  isEditableTarget,
  isQuickPreviewEligible,
  toAssetListQuery,
  type RendererAssetFilters,
} from "../asset-filter";
import { createRelatedCompareSelection } from "../compare-selection";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";
import { AssetGrid } from "./AssetGrid";
import { AssetInspector } from "./AssetInspector";
import { AssetList } from "./AssetList";
import { AudioPlayerBar, type PlayerCommand, type PlayerSnapshot } from "./AudioPlayerBar";
import { BatchActionBar } from "./BatchActionBar";
import { CollectionPanel } from "./CollectionPanel";
import { ComparePanel } from "./ComparePanel";
import { SearchFilterBar } from "./SearchFilterBar";
import { ShortcutHelpDialog } from "./ShortcutHelpDialog";
import { SoundUsageBoardDialog } from "./SoundUsageBoard";
import { TrashView } from "./TrashView";
import { ExportCenterDialog, type ExportCenterInitialOptions } from "./ExportCenterDialog";
import { EmptyState } from "./ui/EmptyState";
import { useConfirm } from "./ui/ConfirmDialog";
import { useToast } from "./ui/ToastProvider";

interface AssetBrowserProps {
  initialSnapshot: LibrarySnapshot;
  onSnapshotChange: (snapshot: LibrarySnapshot) => void;
  menuImportSignal: number;
}

const EMPTY_PLAYER_SNAPSHOT: PlayerSnapshot = {
  assetId: null,
  currentTimeMs: 0,
  durationMs: 0,
  playing: false,
  loop: false,
  pointA: null,
  pointB: null,
};

const ASSET_PAGE_SIZE = 250;

export function AssetBrowser({ initialSnapshot, onSnapshotChange, menuImportSignal }: AssetBrowserProps): JSX.Element {
  const { t, tError, format } = useI18n();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const commandKeyRef = useRef(0);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [filters, setFilters] = useState<RendererAssetFilters>(DEFAULT_ASSET_FILTERS);
  const [sort, setSort] = useState<AssetSortOption>("importedDesc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [playerCommand, setPlayerCommand] = useState<PlayerCommand | null>(null);
  const [playbackState, setPlaybackState] = useState<PlayerSnapshot>(EMPTY_PLAYER_SNAPSHOT);
  const [loudnessMatch, setLoudnessMatch] = useState(false);
  const [comparePairStart, setComparePairStart] = useState(0);
  const [lastCompareSlot, setLastCompareSlot] = useState(1);
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [exportCenterOpen, setExportCenterOpen] = useState(false);
  const [exportCenterInitialOptions, setExportCenterInitialOptions] = useState<ExportCenterInitialOptions | null>(null);
  const [soundBoardOpen, setSoundBoardOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [assetPage, setAssetPage] = useState(1);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const visibleAssets = assets;
  const selectedAsset = selectedAssetId ? assets.find((asset) => asset.id === selectedAssetId) ?? null : null;
  const selectedIdList = Array.from(selectedIds);
  const orderedSelectedAssets = useMemo(
    () => visibleAssets.filter((asset) => selectedIds.has(asset.id)),
    [selectedIds, visibleAssets],
  );
  const compareAssets = orderedSelectedAssets.slice(comparePairStart, comparePairStart + 2);
  const loudnessReferenceAsset = loudnessMatch ? compareAssets[0] ?? null : null;
  const activeFilterCount = getActiveFilterCount(filters);
  const hasMoreAssets = assets.length < totalAssets;

  useEffect(() => {
    void refreshSettings();
    void refreshAll();
  }, []);

  useEffect(() => {
    if (menuImportSignal > 0) {
      void importFiles();
    }
  }, [menuImportSignal]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshAssets(1, false);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [filters, sort]);

  useEffect(() => {
    if (comparePairStart > Math.max(0, orderedSelectedAssets.length - 2)) {
      setComparePairStart(Math.max(0, orderedSelectedAssets.length - 2));
    }
  }, [comparePairStart, orderedSelectedAssets.length]);

  useEffect(() => {
    if (!selectedAsset || !settings || !isQuickPreviewEligible(selectedAsset, settings)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (!isEditableTarget(document.activeElement)) {
        sendPlayerCommand("previewPlay", selectedAsset.id);
      }
    }, 140);
    return () => window.clearTimeout(timeout);
  }, [
    selectedAsset?.id,
    settings?.quickPreviewEnabled,
    settings?.quickPreviewAutoPlayShortSounds,
    settings?.quickPreviewMaxDurationMs,
  ]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchFocusKey((value) => value + 1);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedIds(new Set(visibleAssets.map((asset) => asset.id)));
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        selectByOffset(1);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        selectByOffset(-1);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (selectedAssetId) {
          sendPlayerCommand("play", selectedAssetId);
        }
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        sendPlayerCommand("toggle", selectedAssetId ?? undefined);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        sendPlayerCommand("stop", selectedAssetId ?? undefined);
        setSelectedIds(new Set());
        setSelectedAssetId(null);
        if (shortcutHelpOpen) {
          setShortcutHelpOpen(false);
        }
        return;
      }

      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setShortcutHelpOpen(true);
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFavorite();
        return;
      }

      if (/^[0-5]$/.test(event.key)) {
        event.preventDefault();
        void setRating(Number(event.key));
        return;
      }

      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        sendPlayerCommand("toggleLoop", selectedAssetId ?? undefined);
        return;
      }

      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        sendPlayerCommand("setPointA", selectedAssetId ?? undefined);
        return;
      }

      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        sendPlayerCommand("setPointB", selectedAssetId ?? undefined);
        return;
      }

      if (event.key === "Delete") {
        event.preventDefault();
        void trashSelected();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedAssetId, selectedIds, selectedAsset, visibleAssets, shortcutHelpOpen]);

  async function refreshSettings(): Promise<void> {
    setSettings(await window.suwolAudio.settings.get());
  }

  async function refreshAssets(pageNumber = 1, append = false): Promise<void> {
    setAssetsLoading(true);
    try {
      const page = await window.suwolAudio.assets.list(toAssetListQuery(filters, sort, pageNumber, ASSET_PAGE_SIZE));
      const nextItems = append ? [...assets, ...page.items.filter((item) => !assets.some((asset) => asset.id === item.id))] : page.items;
      setAssets(nextItems);
      setTotalAssets(page.total);
      setAssetPage(page.page);
      setSelectedIds((current) => new Set(Array.from(current).filter((id) => nextItems.some((asset) => asset.id === id))));
      setSelectedAssetId((current) => (current && nextItems.some((asset) => asset.id === current) ? current : null));
    } finally {
      setAssetsLoading(false);
    }
  }

  async function refreshSideData(): Promise<void> {
    const [tags, collections] = await Promise.all([
      window.suwolAudio.tags.list(),
      window.suwolAudio.collections.list(),
    ]);
    const nextSnapshot = { ...snapshot, tags, collections };
    setSnapshot(nextSnapshot);
    onSnapshotChange(nextSnapshot);
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([refreshAssets(), refreshSideData()]);
  }

  async function importFiles(): Promise<void> {
    setStatus(t("import.analysisRunning"));
    try {
      const result = await window.suwolAudio.assets.importFiles();
      await refreshAll();
      const message = t("import.summary", {
        requested: format.number(result.summary.requested),
        success: format.number(result.summary.success),
        duplicates: format.number(result.summary.duplicateSkipped),
        unsupported: format.number(result.summary.unsupportedSkipped),
        analysisFailed: format.number(result.summary.analysisFailed),
        failed: format.number(result.summary.copyFailed + result.summary.otherFailed),
      });
      setStatus(message);
      showToast(result.failed > 0 ? "warning" : "success", message);
    } catch {
      const message = tError("IMPORT_FAILED");
      setStatus(message);
      showToast("error", message);
    }
  }

  async function createCollection(): Promise<void> {
    const name = window.prompt(t("collection.promptName"));
    if (!name?.trim()) {
      return;
    }
    await window.suwolAudio.collections.create({ name });
    await refreshSideData();
  }

  function selectAsset(asset: AssetListItem, index: number, event: MouseEvent): void {
    setSelectedAssetId(asset.id);

    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      setSelectedIds(new Set(visibleAssets.slice(start, end + 1).map((item) => item.id)));
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(asset.id)) {
          next.delete(asset.id);
        } else {
          next.add(asset.id);
        }
        return next;
      });
      setLastSelectedIndex(index);
    } else {
      setSelectedIds(new Set([asset.id]));
      setLastSelectedIndex(index);
    }
  }

  function selectByOffset(offset: number): void {
    if (visibleAssets.length === 0) {
      return;
    }
    const currentIndex = selectedAssetId ? visibleAssets.findIndex((asset) => asset.id === selectedAssetId) : -1;
    const nextIndex = getNextSelectionIndex(currentIndex, visibleAssets.length, offset);
    const asset = visibleAssets[nextIndex] ?? visibleAssets[0];
    if (!asset) {
      return;
    }
    setSelectedAssetId(asset.id);
    setSelectedIds(new Set([asset.id]));
    setLastSelectedIndex(nextIndex);
  }

  function sendPlayerCommand(type: PlayerCommand["type"], assetId?: string): void {
    commandKeyRef.current += 1;
    setPlayerCommand({ key: commandKeyRef.current, type, assetId });
  }

  async function ensureAssetLoaded(assetId: string): Promise<AssetListItem | null> {
    const existing = assets.find((item) => item.id === assetId);
    if (existing) {
      return existing;
    }
    const loaded = await window.suwolAudio.assets.get(assetId);
    if (!loaded) {
      return null;
    }
    setAssets((current) => (current.some((item) => item.id === loaded.id) ? current : [loaded, ...current]));
    return loaded;
  }

  async function playRelatedAsset(assetId: string): Promise<void> {
    const related = await ensureAssetLoaded(assetId);
    if (!related) {
      return;
    }
    setSelectedAssetId(assetId);
    setSelectedIds(new Set([assetId]));
    window.setTimeout(() => sendPlayerCommand("play", assetId), 0);
  }

  async function compareWithRelatedAsset(assetId: string): Promise<void> {
    if (!selectedAssetId) {
      return;
    }
    const related = await ensureAssetLoaded(assetId);
    if (!related) {
      return;
    }
    const selection = createRelatedCompareSelection(selectedAssetId, assetId);
    setSelectedIds(new Set(selection.selectedIds));
    setComparePairStart(selection.comparePairStart);
  }

  async function compareSoundBoardAssets(assetIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(assetIds)).slice(0, 2);
    if (uniqueIds.length < 2) {
      return;
    }
    const loadedAssets = (await Promise.all(uniqueIds.map((assetId) => window.suwolAudio.assets.get(assetId)))).filter(
      (asset): asset is AssetListItem => asset !== null,
    );
    if (loadedAssets.length < 2) {
      return;
    }
    setAssets((current) => {
      const withoutCompared = current.filter((asset) => !uniqueIds.includes(asset.id));
      return [...loadedAssets, ...withoutCompared];
    });
    setSelectedIds(new Set(uniqueIds));
    setSelectedAssetId(uniqueIds[0] ?? null);
    setComparePairStart(0);
  }

  async function updateSelectedAssets(input: { rating?: number; favorite?: boolean }): Promise<void> {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : selectedAssetId ? [selectedAssetId] : [];
    for (const assetId of ids) {
      await window.suwolAudio.assets.update(assetId, input);
    }
    await refreshAssets();
  }

  async function toggleFavorite(): Promise<void> {
    if (!selectedAsset) {
      return;
    }
    await updateSelectedAssets({ favorite: !selectedAsset.favorite });
  }

  async function setRating(rating: number): Promise<void> {
    await updateSelectedAssets({ rating });
  }

  async function trashSelected(): Promise<void> {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : selectedAssetId ? [selectedAssetId] : [];
    if (
      ids.length === 0 ||
      !(await confirm({
        title: t("trash.title"),
        message: t("trash.confirmMove" as MessageKey),
        confirmLabel: t("trash.move"),
        danger: true,
      }))
    ) {
      return;
    }
    await window.suwolAudio.assets.trash(ids);
    setSelectedIds(new Set());
    setSelectedAssetId(null);
    await refreshAssets();
    showToast("success", t("trash.move"));
  }

  function playCompareSlot(slotIndex: number): void {
    const asset = compareAssets[slotIndex];
    if (!asset) {
      return;
    }
    setLastCompareSlot(slotIndex);
    setSelectedAssetId(asset.id);
    sendPlayerCommand("play", asset.id);
  }

  function playAlternateCompareSlot(): void {
    const nextSlot = lastCompareSlot === 0 ? 1 : 0;
    playCompareSlot(nextSlot);
  }

  function moveComparePair(offset: number): void {
    const maxStart = Math.max(0, orderedSelectedAssets.length - 2);
    setComparePairStart((current) => Math.max(0, Math.min(maxStart, current + offset)));
  }

  return (
    <main className="asset-browser">
      <CollectionPanel
        library={snapshot.library}
        tags={snapshot.tags}
        collections={snapshot.collections}
        filters={filters}
        onFiltersChange={setFilters}
        onCreateCollection={createCollection}
      />

      <section className="browser-main">
        <SearchFilterBar
          filters={filters}
          tags={snapshot.tags}
          collections={snapshot.collections}
          viewMode={viewMode}
          sort={sort}
          searchFocusKey={searchFocusKey}
          selectedAssetIds={selectedIdList}
          activeFilterCount={activeFilterCount}
          onFiltersChange={setFilters}
          onViewModeChange={setViewMode}
          onSortChange={setSort}
          onImport={importFiles}
          onRefresh={refreshAll}
          onExport={() => setExportCenterOpen(true)}
          onSoundBoard={() => setSoundBoardOpen(true)}
          onSettingsChanged={setSettings}
        />

        {status ? <div className="status-line" role="status" aria-live="polite">{status}</div> : null}

        <ComparePanel
          compareAssets={compareAssets}
          loudnessMatch={loudnessMatch}
          onLoudnessMatchChange={setLoudnessMatch}
          onPlaySlot={playCompareSlot}
          onAlternate={playAlternateCompareSlot}
          onPreviousPair={() => moveComparePair(-1)}
          onNextPair={() => moveComparePair(1)}
        />

        {filters.onlyTrashed ? (
          <TrashView count={totalAssets} />
        ) : (
          <div className="asset-count">{t("asset.assetCount", { count: format.number(totalAssets) })}</div>
        )}

        {visibleAssets.length === 0 && !assetsLoading ? (
          <EmptyState
            title={totalAssets === 0 ? t("asset.empty") : t("asset.noResults")}
            body={activeFilterCount > 0 ? t("asset.emptyFiltered") : undefined}
            action={
              totalAssets === 0 ? (
                <button className="primary-button compact" type="button" onClick={importFiles}>
                  {t("import.action")}
                </button>
              ) : null
            }
          />
        ) : viewMode === "list" ? (
          <AssetList
            assets={visibleAssets}
            selectedIds={selectedIds}
            selectedAssetId={selectedAssetId}
            playingAssetId={playbackState.playing ? playbackState.assetId : null}
            onSelectAsset={selectAsset}
          />
        ) : (
          <AssetGrid
            assets={visibleAssets}
            selectedIds={selectedIds}
            selectedAssetId={selectedAssetId}
            playingAssetId={playbackState.playing ? playbackState.assetId : null}
            onSelectAsset={selectAsset}
          />
        )}
        {visibleAssets.length > 0 ? (
          <div className="asset-load-row">
            <span>
              {t("asset.loadedCount", { loaded: format.number(visibleAssets.length), total: format.number(totalAssets) })}
            </span>
            <button
              className="secondary-button compact"
              type="button"
              disabled={!hasMoreAssets || assetsLoading}
              onClick={() => refreshAssets(assetPage + 1, true)}
            >
              {assetsLoading ? t("common.loading") : t("asset.loadMore")}
            </button>
          </div>
        ) : null}
      </section>

      <AssetInspector
        asset={selectedAsset}
        tags={snapshot.tags}
        collections={snapshot.collections}
        playbackState={playbackState}
        onExportAsset={() => {
          setExportCenterInitialOptions(null);
          setExportCenterOpen(true);
        }}
        onRefresh={refreshAll}
        onPlayAsset={playRelatedAsset}
        onCompareAsset={compareWithRelatedAsset}
        onOpenSoundBoard={() => setSoundBoardOpen(true)}
      />

      <BatchActionBar
        selectedAssetIds={selectedIdList}
        tags={snapshot.tags}
        collections={snapshot.collections}
        onlyTrashed={filters.onlyTrashed}
        onExport={() => {
          setExportCenterInitialOptions(null);
          setExportCenterOpen(true);
        }}
        onDone={refreshAll}
      />

      <ExportCenterDialog
        open={exportCenterOpen}
        selectedAssetIds={selectedIdList}
        currentQuery={toAssetListQuery(filters, sort)}
        tags={snapshot.tags}
        collections={snapshot.collections}
        initialOptions={exportCenterInitialOptions}
        onClose={() => setExportCenterOpen(false)}
      />

      <SoundUsageBoardDialog
        open={soundBoardOpen}
        selectedAssetId={selectedAssetId}
        selectedAssetIds={selectedIdList}
        onClose={() => setSoundBoardOpen(false)}
        onPlayAsset={playRelatedAsset}
        onCompareAssets={compareSoundBoardAssets}
        onOpenExportCenter={(initialOptions) => {
          setExportCenterInitialOptions(initialOptions);
          setExportCenterOpen(true);
        }}
      />

      <ShortcutHelpDialog open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />

      <AudioPlayerBar
        asset={selectedAsset}
        command={playerCommand}
        loudnessMatch={loudnessMatch}
        loudnessReferenceAsset={loudnessReferenceAsset}
        stopPreviousOnSelectionChange={settings?.stopPreviousOnSelectionChange ?? true}
        onPlaybackStateChange={setPlaybackState}
        onAssetRefresh={refreshAssets}
      />
    </main>
  );
}

import { ClipboardList, FileOutput, Grid2X2, Import, List, RefreshCw, Search, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AssetSortOption, CollectionRecord, TagRecord, ViewMode } from "../../shared/library-types";
import type { AppSettings } from "../../shared/settings-types";
import type { RendererAssetFilters } from "../asset-filter";
import { useI18n } from "../i18n/useI18n";
import { formatClassificationLabel } from "../i18n/analysis-labels";
import type { MessageKey } from "../i18n/i18n";
import { SettingsDialog } from "./SettingsDialog";

interface SearchFilterBarProps {
  filters: RendererAssetFilters;
  tags: TagRecord[];
  collections: CollectionRecord[];
  viewMode: ViewMode;
  sort: AssetSortOption;
  searchFocusKey: number;
  selectedAssetIds: string[];
  activeFilterCount: number;
  onFiltersChange: (filters: RendererAssetFilters) => void;
  onViewModeChange: (viewMode: ViewMode) => void;
  onSortChange: (sort: AssetSortOption) => void;
  onImport: () => void;
  onRefresh: () => void;
  onExport: () => void;
  onSoundBoard: () => void;
  onSettingsChanged: (settings: AppSettings) => void;
}

const CLASSIFICATION_OPTIONS = ["music", "sfx", "ui_sound", "voice", "ambience"] as const;
const SORT_OPTIONS: AssetSortOption[] = [
  "importedDesc",
  "fileNameAsc",
  "durationAsc",
  "durationDesc",
  "ratingDesc",
  "lastPlayedDesc",
  "rmsDesc",
  "peakDesc",
  "loopScoreDesc",
  "classificationAsc",
  "formatAsc",
];

export function SearchFilterBar({
  filters,
  tags,
  collections,
  viewMode,
  sort,
  searchFocusKey,
  selectedAssetIds,
  activeFilterCount,
  onFiltersChange,
  onViewModeChange,
  onSortChange,
  onImport,
  onRefresh,
  onExport,
  onSoundBoard,
  onSettingsChanged,
}: SearchFilterBarProps): JSX.Element {
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchFocusKey > 0) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [searchFocusKey]);

  return (
    <header className="search-filter-bar">
      <label className="search-box">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchInputRef}
          value={filters.search}
          aria-label={t("search.placeholder")}
          placeholder={t("search.placeholder")}
          onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
        />
      </label>

      <select
        value={filters.tagIds[0] ?? ""}
        onChange={(event) => onFiltersChange({ ...filters, tagIds: event.target.value ? [event.target.value] : [] })}
      >
        <option value="">{t("filter.allTags")}</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>

      <select value={sort} onChange={(event) => onSortChange(event.target.value as AssetSortOption)} aria-label={t("sort.title")}>
        {SORT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {t(`sort.${option}` as MessageKey)}
          </option>
        ))}
      </select>

      <select
        value={filters.collectionIds[0] ?? ""}
        onChange={(event) =>
          onFiltersChange({ ...filters, collectionIds: event.target.value ? [event.target.value] : [] })
        }
      >
        <option value="">{t("filter.allCollections")}</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.name}
          </option>
        ))}
      </select>

      <select
        value={filters.classificationTypes[0] ?? ""}
        onChange={(event) =>
          onFiltersChange({
            ...filters,
            classificationTypes: event.target.value ? [event.target.value] : [],
          })
        }
      >
        <option value="">{t("filter.allClassifications")}</option>
        {CLASSIFICATION_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {formatClassificationLabel(option, t)}
          </option>
        ))}
      </select>

      <label className="toggle-chip">
        <input
          type="checkbox"
          checked={filters.favoriteOnly}
          onChange={(event) => onFiltersChange({ ...filters, favoriteOnly: event.target.checked })}
        />
        {t("asset.favorite")}
      </label>

      <label className="toggle-chip">
        <input
          type="checkbox"
          checked={filters.loopHigh}
          onChange={(event) => onFiltersChange({ ...filters, loopHigh: event.target.checked })}
        />
        {t("filter.loopHigh")}
      </label>

      <label className="toggle-chip">
        <input
          type="checkbox"
          checked={filters.shortOnly}
          onChange={(event) => onFiltersChange({ ...filters, shortOnly: event.target.checked })}
        />
        {t("filter.shortUnder1s")}
      </label>

      <label className="toggle-chip">
        <input
          type="checkbox"
          checked={filters.unplayableOnly}
          onChange={(event) => onFiltersChange({ ...filters, unplayableOnly: event.target.checked, playableOnly: false })}
        />
        {t("asset.unplayable")}
      </label>

      <button className="secondary-button compact" type="button" onClick={() => onFiltersChange({ ...filters, search: "", smartFolder: "all", onlyTrashed: false, favoriteOnly: false, minRating: 0, tagIds: [], collectionIds: [], classificationTypes: [], loopHigh: false, shortOnly: false, longOnly: false, playableOnly: false, unplayableOnly: false })}>
        {activeFilterCount > 0 ? `${t("filter.reset")} (${activeFilterCount})` : t("filter.reset")}
      </button>

      <div className="toolbar-spacer" />

      <button className="icon-button" type="button" onClick={onRefresh} title={t("common.refresh")} aria-label={t("common.refresh")}>
        <RefreshCw size={16} aria-hidden="true" />
      </button>
      <button className="icon-button" type="button" onClick={onExport} title={t("export.title")} aria-label={t("export.title")}>
        <FileOutput size={16} aria-hidden="true" />
      </button>
      <button className="icon-button" type="button" onClick={onSoundBoard} title={t("soundBoard.title" as MessageKey)} aria-label={t("soundBoard.title" as MessageKey)}>
        <ClipboardList size={16} aria-hidden="true" />
      </button>
      <button className="icon-button" type="button" onClick={() => onViewModeChange("list")} title={t("common.list")} aria-label={t("common.list")}>
        <List size={16} aria-hidden="true" className={viewMode === "list" ? "is-active-icon" : ""} />
      </button>
      <button className="icon-button" type="button" onClick={() => onViewModeChange("grid")} title={t("common.grid")} aria-label={t("common.grid")}>
        <Grid2X2 size={16} aria-hidden="true" className={viewMode === "grid" ? "is-active-icon" : ""} />
      </button>
      <button className="icon-button" type="button" onClick={() => setSettingsOpen(true)} title={t("app.settings")} aria-label={t("app.settings")}>
        <Settings size={16} aria-hidden="true" />
      </button>
      <button className="primary-button compact" type="button" onClick={onImport}>
        <Import size={16} aria-hidden="true" />
        {t("import.action")}
      </button>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSettingsChanged={onSettingsChanged}
        selectedAssetIds={selectedAssetIds}
      />
    </header>
  );
}

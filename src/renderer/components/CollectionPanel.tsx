import { Archive, Clock3, FolderPlus, Headphones, Library, Music2, Repeat2, Sparkles, Star, Tags, Trash2, VolumeX, Zap } from "lucide-react";
import type { CollectionRecord, LibraryRecord, SmartFolderId, TagRecord } from "../../shared/library-types";
import type { RendererAssetFilters } from "../asset-filter";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface CollectionPanelProps {
  library: LibraryRecord;
  tags: TagRecord[];
  collections: CollectionRecord[];
  filters: RendererAssetFilters;
  onFiltersChange: (filters: RendererAssetFilters) => void;
  onCreateCollection: () => void;
}

export function CollectionPanel({
  library,
  tags,
  collections,
  filters,
  onFiltersChange,
  onCreateCollection,
}: CollectionPanelProps): JSX.Element {
  const { t } = useI18n();
  const smartFolders: Array<{ id: SmartFolderId; label: string; icon: JSX.Element }> = [
    { id: "recentImports", label: t("smartFolder.recentImports"), icon: <Clock3 size={15} aria-hidden="true" /> },
    { id: "recentPlayed", label: t("smartFolder.recentPlayed"), icon: <Headphones size={15} aria-hidden="true" /> },
    { id: "shortSounds", label: t("smartFolder.shortSounds"), icon: <Zap size={15} aria-hidden="true" /> },
    { id: "longBeds", label: t("smartFolder.longBeds"), icon: <Music2 size={15} aria-hidden="true" /> },
    { id: "uiCandidates", label: t("smartFolder.uiCandidates"), icon: <Sparkles size={15} aria-hidden="true" /> },
    { id: "sfxCandidates", label: t("smartFolder.sfxCandidates"), icon: <Zap size={15} aria-hidden="true" /> },
    { id: "musicCandidates", label: t("smartFolder.musicCandidates"), icon: <Music2 size={15} aria-hidden="true" /> },
    { id: "voiceCandidates", label: t("smartFolder.voiceCandidates"), icon: <Headphones size={15} aria-hidden="true" /> },
    { id: "ambienceCandidates", label: t("smartFolder.ambienceCandidates"), icon: <Headphones size={15} aria-hidden="true" /> },
    { id: "loopCandidates", label: t("smartFolder.loopCandidates"), icon: <Repeat2 size={15} aria-hidden="true" /> },
    { id: "similarCandidates", label: t("smartFolder.similarCandidates" as MessageKey), icon: <Sparkles size={15} aria-hidden="true" /> },
    { id: "highLoopCandidates", label: t("smartFolder.highLoopCandidates" as MessageKey), icon: <Repeat2 size={15} aria-hidden="true" /> },
    { id: "silenceStart", label: t("smartFolder.silenceStart" as MessageKey), icon: <VolumeX size={15} aria-hidden="true" /> },
    { id: "silenceEnd", label: t("smartFolder.silenceEnd" as MessageKey), icon: <VolumeX size={15} aria-hidden="true" /> },
    { id: "highPeak", label: t("smartFolder.highPeak" as MessageKey), icon: <Zap size={15} aria-hidden="true" /> },
    { id: "highRms", label: t("smartFolder.highRms" as MessageKey), icon: <Headphones size={15} aria-hidden="true" /> },
    { id: "featureMissing", label: t("smartFolder.featureMissing" as MessageKey), icon: <VolumeX size={15} aria-hidden="true" /> },
    { id: "needsReanalysis", label: t("smartFolder.needsReanalysis" as MessageKey), icon: <Clock3 size={15} aria-hidden="true" /> },
    { id: "retro8BitCandidates", label: t("smartFolder.retro8BitCandidates"), icon: <Sparkles size={15} aria-hidden="true" /> },
    { id: "retro16BitCandidates", label: t("smartFolder.retro16BitCandidates"), icon: <Sparkles size={15} aria-hidden="true" /> },
    { id: "analysisFailed", label: t("smartFolder.analysisFailed"), icon: <VolumeX size={15} aria-hidden="true" /> },
    { id: "unplayable", label: t("smartFolder.unplayable"), icon: <VolumeX size={15} aria-hidden="true" /> },
    { id: "duplicateCandidates", label: t("smartFolder.duplicateCandidates"), icon: <Archive size={15} aria-hidden="true" /> },
  ];

  return (
    <aside className="collection-panel">
      <div className="library-title">
        <Library size={20} aria-hidden="true" />
        <div>
          <strong>{library.name}</strong>
          <small>{library.rootPath}</small>
        </div>
      </div>

      <nav className="side-nav">
        <button
          type="button"
          className={!filters.onlyTrashed && !filters.favoriteOnly && filters.smartFolder === "all" ? "is-selected" : ""}
          aria-pressed={!filters.onlyTrashed && !filters.favoriteOnly && filters.smartFolder === "all"}
          onClick={() => onFiltersChange({ ...filters, smartFolder: "all", onlyTrashed: false, favoriteOnly: false })}
        >
          <Archive size={15} aria-hidden="true" />
          {t("asset.all")}
        </button>
        <button
          type="button"
          className={filters.favoriteOnly ? "is-selected" : ""}
          aria-pressed={filters.favoriteOnly}
          onClick={() => onFiltersChange({ ...filters, smartFolder: "favorites", onlyTrashed: false, favoriteOnly: true })}
        >
          <Star size={15} aria-hidden="true" />
          {t("asset.favorite")}
        </button>
        <button
          type="button"
          className={filters.onlyTrashed ? "is-selected" : ""}
          aria-pressed={filters.onlyTrashed}
          onClick={() => onFiltersChange({ ...filters, smartFolder: "trash", onlyTrashed: true })}
        >
          <Trash2 size={15} aria-hidden="true" />
          {t("trash.title")}
        </button>
      </nav>

      <div className="side-section">
        <div className="side-section-header">
          <span>{t("smartFolder.title")}</span>
        </div>
        {smartFolders.map((folder) => (
          <button
            type="button"
            className={filters.smartFolder === folder.id ? "side-filter is-selected" : "side-filter"}
            aria-pressed={filters.smartFolder === folder.id}
            key={folder.id}
            onClick={() =>
              onFiltersChange({
                ...filters,
                smartFolder: filters.smartFolder === folder.id ? "all" : folder.id,
                onlyTrashed: false,
                favoriteOnly: folder.id === "favorites",
              })
            }
          >
            {folder.icon}
            {folder.label}
          </button>
        ))}
      </div>

      <div className="side-section">
        <div className="side-section-header">
          <span>{t("collection.title")}</span>
          <button className="mini-icon-button" type="button" onClick={onCreateCollection} title={t("collection.create")} aria-label={t("collection.create")}>
            <FolderPlus size={14} aria-hidden="true" />
          </button>
        </div>
        {collections.length === 0 ? <p className="side-empty">{t("collection.empty")}</p> : collections.map((collection) => (
          <button
            type="button"
            className={filters.collectionIds.includes(collection.id) ? "side-filter is-selected" : "side-filter"}
            aria-pressed={filters.collectionIds.includes(collection.id)}
            key={collection.id}
            onClick={() =>
              onFiltersChange({
                ...filters,
                onlyTrashed: false,
                collectionIds: filters.collectionIds.includes(collection.id) ? [] : [collection.id],
              })
            }
          >
            {collection.name}
          </button>
        ))}
      </div>

      <div className="side-section">
        <div className="side-section-header">
          <span>{t("tag.title")}</span>
          <Tags size={14} aria-hidden="true" />
        </div>
        {tags.length === 0 ? <p className="side-empty">{t("tag.empty")}</p> : tags.map((tag) => (
          <button
            type="button"
            className={filters.tagIds.includes(tag.id) ? "side-filter is-selected" : "side-filter"}
            aria-pressed={filters.tagIds.includes(tag.id)}
            key={tag.id}
            onClick={() =>
              onFiltersChange({
                ...filters,
                onlyTrashed: false,
                tagIds: filters.tagIds.includes(tag.id) ? [] : [tag.id],
              })
            }
          >
            <span className="tag-dot" style={{ background: tag.color }} />
            {tag.name}
          </button>
        ))}
      </div>
    </aside>
  );
}

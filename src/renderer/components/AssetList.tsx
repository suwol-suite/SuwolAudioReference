import { Heart, Star } from "lucide-react";
import type { MouseEvent } from "react";
import type { AssetListItem } from "../../shared/library-types";
import { getAudioAnalysisBadgeLabels } from "../audio-analysis-filters";
import { useI18n } from "../i18n/useI18n";
import { WaveformPreview } from "./WaveformPreview";
import { StatusBadge, analysisBadgeTone, playbackBadgeTone } from "./ui/StatusBadge";

interface AssetListProps {
  assets: AssetListItem[];
  selectedIds: Set<string>;
  selectedAssetId: string | null;
  playingAssetId: string | null;
  onSelectAsset: (asset: AssetListItem, index: number, event: MouseEvent) => void;
}

export function AssetList({ assets, selectedIds, selectedAssetId, playingAssetId, onSelectAsset }: AssetListProps): JSX.Element {
  const { t, format } = useI18n();

  return (
    <div className="asset-list" role="grid" aria-label={t("common.list")}>
      <div className="asset-list-header" role="row">
        <span>{t("asset.fileName")}</span>
        <span>{t("waveform.title")}</span>
        <span>{t("asset.duration")}</span>
        <span>{t("asset.classification")}</span>
        <span>{t("asset.tags")}</span>
        <span>{t("asset.rating")}</span>
        <span>{t("asset.lastPlayed")}</span>
        <span>{t("asset.format")}</span>
      </div>
      {assets.map((asset, index) => (
        <button
          type="button"
          role="row"
          key={asset.id}
          className={[
            "asset-row",
            selectedIds.has(asset.id) ? "is-selected" : "",
            selectedAssetId === asset.id ? "is-focused" : "",
            playingAssetId === asset.id ? "is-playing" : "",
            !asset.playable ? "is-muted" : "",
          ].join(" ")}
          aria-selected={selectedIds.has(asset.id)}
          title={!asset.playable ? t(`playbackReason.${asset.playbackSupportReason ?? "CODEC_UNSUPPORTED"}` as Parameters<typeof t>[0]) : undefined}
          onClick={(event) => onSelectAsset(asset, index, event)}
        >
          <span className="asset-name-cell">
            <strong>{asset.title || asset.fileName}</strong>
            <small>{asset.fileName}</small>
          </span>
          <span className="asset-waveform-cell">
            <WaveformPreview asset={asset} />
          </span>
          <span>{format.duration(asset.audioAnalysis?.durationMs)}</span>
          <span className="badge-list">
            {playingAssetId === asset.id ? <StatusBadge tone="accent">{t("asset.playing")}</StatusBadge> : null}
            <StatusBadge tone={playbackBadgeTone(asset.playable, asset.fileMissing)}>
              {asset.playable ? t("player.ready") : t("asset.unplayable")}
            </StatusBadge>
            <StatusBadge tone={analysisBadgeTone(Boolean(asset.audioAnalysis), asset.mediaType === "audio")}>
              {asset.audioAnalysis ? t("waveform.ready") : t("asset.analysisPending")}
            </StatusBadge>
            {getAudioAnalysisBadgeLabels(asset.audioAnalysis, t).map((label) => (
              <em key={label}>{label}</em>
            ))}
          </span>
          <span className="tag-list-inline">
            {asset.tags.slice(0, 3).map((tag) => (
              <small key={tag.id}>{tag.name}</small>
            ))}
          </span>
          <span className="rating-cell">
            {asset.favorite ? <Heart size={14} aria-hidden="true" /> : null}
            {Array.from({ length: asset.rating }).map((_, starIndex) => (
              <Star key={starIndex} size={13} aria-hidden="true" />
            ))}
          </span>
          <span>{asset.lastPlayedAt ? format.dateTime(asset.lastPlayedAt) : "-"}</span>
          <span>{asset.audioAnalysis?.format ?? asset.fileExt}</span>
        </button>
      ))}
    </div>
  );
}

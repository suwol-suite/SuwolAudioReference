import { Heart, Star } from "lucide-react";
import type { MouseEvent } from "react";
import type { AssetListItem } from "../../shared/library-types";
import { getAudioAnalysisBadgeLabels } from "../audio-analysis-filters";
import { useI18n } from "../i18n/useI18n";
import { WaveformPreview } from "./WaveformPreview";
import { StatusBadge, analysisBadgeTone, playbackBadgeTone } from "./ui/StatusBadge";

interface AssetGridProps {
  assets: AssetListItem[];
  selectedIds: Set<string>;
  selectedAssetId: string | null;
  playingAssetId: string | null;
  onSelectAsset: (asset: AssetListItem, index: number, event: MouseEvent) => void;
}

export function AssetGrid({ assets, selectedIds, selectedAssetId, playingAssetId, onSelectAsset }: AssetGridProps): JSX.Element {
  const { t, format } = useI18n();

  return (
    <div className="asset-grid" aria-label={t("common.grid")}>
      {assets.map((asset, index) => (
        <button
          className={[
            "asset-card",
            selectedIds.has(asset.id) ? "is-selected" : "",
            selectedAssetId === asset.id ? "is-focused" : "",
            playingAssetId === asset.id ? "is-playing" : "",
          ].join(" ")}
          key={asset.id}
          type="button"
          aria-selected={selectedIds.has(asset.id)}
          onClick={(event) => onSelectAsset(asset, index, event)}
        >
          <WaveformPreview asset={asset} />
          <strong>{asset.title || asset.fileName}</strong>
          <span>{format.duration(asset.audioAnalysis?.durationMs)}</span>
          <div className="badge-list">
            {playingAssetId === asset.id ? <StatusBadge tone="accent">{t("asset.playing")}</StatusBadge> : null}
            <StatusBadge tone={playbackBadgeTone(asset.playable, asset.fileMissing)}>
              {asset.playable ? t("player.ready") : t("asset.unplayable")}
            </StatusBadge>
            <StatusBadge tone={analysisBadgeTone(Boolean(asset.audioAnalysis), asset.mediaType === "audio")}>
              {asset.audioAnalysis ? t("waveform.ready") : t("asset.analysisPending")}
            </StatusBadge>
          </div>
          <div className="badge-list">
            {getAudioAnalysisBadgeLabels(asset.audioAnalysis, t).map((label) => (
              <em key={label}>{label}</em>
            ))}
          </div>
          <div className="card-meta">
            {asset.favorite ? <Heart size={14} aria-hidden="true" /> : null}
            {Array.from({ length: asset.rating }).map((_, starIndex) => (
              <Star key={starIndex} size={13} aria-hidden="true" />
            ))}
            {asset.playCount > 0 ? <small>{t("asset.playCountShort", { count: format.number(asset.playCount) })}</small> : null}
          </div>
        </button>
      ))}
    </div>
  );
}

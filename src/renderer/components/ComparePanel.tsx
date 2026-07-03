import { ArrowLeftRight, ChevronsLeft, ChevronsRight, Play } from "lucide-react";
import type { AssetListItem } from "../../shared/library-types";
import { useI18n } from "../i18n/useI18n";

interface ComparePanelProps {
  compareAssets: AssetListItem[];
  loudnessMatch: boolean;
  onLoudnessMatchChange: (enabled: boolean) => void;
  onPlaySlot: (slotIndex: number) => void;
  onAlternate: () => void;
  onPreviousPair: () => void;
  onNextPair: () => void;
}

export function ComparePanel({
  compareAssets,
  loudnessMatch,
  onLoudnessMatchChange,
  onPlaySlot,
  onAlternate,
  onPreviousPair,
  onNextPair,
}: ComparePanelProps): JSX.Element | null {
  const { t } = useI18n();
  if (compareAssets.length < 2) {
    return null;
  }

  const [assetA, assetB] = compareAssets;
  if (!assetA || !assetB) {
    return null;
  }

  return (
    <section className="compare-panel" aria-label={t("compare.title")}>
      <div className="compare-slots">
        <CompareSlot label="A" asset={assetA} onPlay={() => onPlaySlot(0)} />
        <CompareSlot label="B" asset={assetB} onPlay={() => onPlaySlot(1)} />
      </div>
      <div className="compare-actions">
        <button className="secondary-button compact" type="button" onClick={onAlternate}>
          <ArrowLeftRight size={14} aria-hidden="true" />
          {t("compare.alternate")}
        </button>
        <button className="icon-button" type="button" onClick={onPreviousPair} title={t("compare.previousPair")} aria-label={t("compare.previousPair")}>
          <ChevronsLeft size={15} aria-hidden="true" />
        </button>
        <button className="icon-button" type="button" onClick={onNextPair} title={t("compare.nextPair")} aria-label={t("compare.nextPair")}>
          <ChevronsRight size={15} aria-hidden="true" />
        </button>
        <label className="toggle-chip">
          <input type="checkbox" checked={loudnessMatch} onChange={(event) => onLoudnessMatchChange(event.target.checked)} />
          {t("compare.loudnessMatch")}
        </label>
      </div>
    </section>
  );
}

function CompareSlot({ label, asset, onPlay }: { label: string; asset: AssetListItem; onPlay: () => void }): JSX.Element {
  return (
    <button className="compare-slot" type="button" onClick={onPlay} disabled={!asset.playable}>
      <span>{label}</span>
      <strong>{asset.title || asset.fileName}</strong>
      <Play size={14} aria-hidden="true" />
    </button>
  );
}

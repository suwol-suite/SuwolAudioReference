import { GitCompareArrows, Play, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { SimilarityCandidate, SimilaritySearchResult } from "../../shared/audio-feature-types";
import type { AssetListItem } from "../../shared/library-types";
import { formatClassificationLabel } from "../i18n/analysis-labels";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface SimilarSoundsPanelProps {
  asset: AssetListItem;
  disabled?: boolean;
  onPlayAsset: (assetId: string) => Promise<void> | void;
  onCompareAsset: (assetId: string) => Promise<void> | void;
  onRefresh: () => Promise<void>;
}

export function SimilarSoundsPanel({
  asset,
  disabled = false,
  onPlayAsset,
  onCompareAsset,
  onRefresh,
}: SimilarSoundsPanelProps): JSX.Element {
  const { t, format } = useI18n();
  const [result, setResult] = useState<SimilaritySearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    void load();
  }, [asset.id]);

  async function load(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setResult(await window.suwolAudio.similarity.findForAsset({ assetId: asset.id, limit: 8, threshold: 0.55 }));
    } catch {
      setError(t("error.SIMILARITY_SEARCH_FAILED" as MessageKey));
    } finally {
      setBusy(false);
    }
  }

  async function rerunFeatures(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await window.suwolAudio.analysis.featuresRerun(asset.id);
      await onRefresh();
      await load();
    } catch {
      setError(t("error.FEATURE_RERUN_FAILED" as MessageKey));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="similar-sounds-panel">
      <div className="similar-sounds-toolbar">
        <span className="muted">
          {result?.feature
            ? t("similarity.summary", { count: format.number(result.candidates.length) })
            : t("similarity.featureMissing")}
        </span>
        <button className="secondary-button compact" type="button" onClick={() => void rerunFeatures()} disabled={disabled || busy}>
          <RefreshCw size={15} aria-hidden="true" />
          {t("similarity.rerunFeatures")}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {busy && !result ? <p className="muted">{t("common.loading")}</p> : null}
      {!busy && result?.candidates.length === 0 ? <p className="muted">{t("similarity.empty")}</p> : null}

      {result?.candidates.length ? (
        <ul className="similar-sounds-list">
          {result.candidates.map((candidate) => (
            <li key={candidate.asset.id} className={candidate.duplicate ? "is-duplicate" : ""}>
              <SimilarityCandidateRow
                candidate={candidate}
                formatDuration={format.duration}
                t={t}
                onPlayAsset={onPlayAsset}
                onCompareAsset={onCompareAsset}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SimilarityCandidateRow({
  candidate,
  formatDuration,
  t,
  onPlayAsset,
  onCompareAsset,
}: {
  candidate: SimilarityCandidate;
  formatDuration: (value?: number | null) => string;
  t: (key: MessageKey, params?: Record<string, string | number | boolean | null | undefined>) => string;
  onPlayAsset: (assetId: string) => Promise<void> | void;
  onCompareAsset: (assetId: string) => Promise<void> | void;
}): JSX.Element {
  const playable = candidate.asset.playable && !candidate.asset.fileMissing;
  const classification =
    candidate.primaryClassification === "unknown"
      ? t("classification.unknown")
      : formatClassificationLabel(candidate.primaryClassification, t);

  return (
    <>
      <div className="similar-sounds-main">
        <div>
          <strong title={candidate.asset.fileName}>{candidate.asset.title || candidate.asset.fileName}</strong>
          <span>
            {formatDuration(candidate.asset.audioAnalysis?.durationMs)}
            {" / "}
            {classification}
            {" / "}
            {formatDb(candidate.asset.audioAnalysis?.rmsDb)} RMS
            {" / "}
            {formatDb(candidate.asset.audioAnalysis?.peakDb)} Peak
          </span>
        </div>
        <div className="similar-score">
          <b>{Math.round(candidate.score * 100)}%</b>
          <em>{t(`similarity.label.${candidate.label}` as MessageKey)}</em>
        </div>
      </div>

      <div className="similar-reasons">
        {candidate.reasons.map((reason) => (
          <span key={reason.code}>{t(`similarity.reason.${reason.code}` as MessageKey)}</span>
        ))}
        {candidate.sharedTagNames.slice(0, 3).map((tagName) => (
          <span key={tagName}>{tagName}</span>
        ))}
      </div>

      <div className="similar-actions">
        <button
          className="secondary-button compact"
          type="button"
          disabled={!playable}
          onClick={() => void onPlayAsset(candidate.asset.id)}
        >
          <Play size={14} aria-hidden="true" />
          {playable ? t("player.play") : t("asset.unplayable")}
        </button>
        <button
          className="secondary-button compact"
          type="button"
          disabled={!playable}
          onClick={() => void onCompareAsset(candidate.asset.id)}
        >
          <GitCompareArrows size={14} aria-hidden="true" />
          {t("similarity.addToCompare")}
        </button>
      </div>
    </>
  );
}

function formatDb(value: number | null | undefined): string {
  return Number.isFinite(value) ? `${(value as number).toFixed(1)} dB` : "-";
}

import { Copy, FileOutput, Heart, RefreshCw, Save, Star } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AudioAnalysisResult } from "../../shared/audio-analysis-types";
import type { AssetRightsMetadata } from "../../shared/export-types";
import type { AssetListItem, CollectionRecord, TagRecord } from "../../shared/library-types";
import { AudioAnalysisRecommendations } from "./AudioAnalysisRecommendations";
import type { PlayerSnapshot } from "./AudioPlayerBar";
import { SimilarSoundsPanel } from "./SimilarSoundsPanel";
import { TagEditor } from "./TagEditor";
import { WaveformPreview } from "./WaveformPreview";
import { EmptyState } from "./ui/EmptyState";
import { useToast } from "./ui/ToastProvider";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface AssetInspectorProps {
  asset: AssetListItem | null;
  tags: TagRecord[];
  collections: CollectionRecord[];
  playbackState: PlayerSnapshot;
  onExportAsset: () => void;
  onRefresh: () => Promise<void>;
  onPlayAsset: (assetId: string) => Promise<void> | void;
  onCompareAsset: (assetId: string) => Promise<void> | void;
}

export function AssetInspector({
  asset,
  collections,
  playbackState,
  onExportAsset,
  onRefresh,
  onPlayAsset,
  onCompareAsset,
}: AssetInspectorProps): JSX.Element {
  const { locale, t, format } = useI18n();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [rights, setRights] = useState<AssetRightsMetadata | null>(null);
  const [rightsBusy, setRightsBusy] = useState(false);

  useEffect(() => {
    setTitle(asset?.title ?? "");
    setMemo(asset?.memo ?? "");
    setCollectionId("");
    setRights(null);
    if (asset) {
      void window.suwolAudio.rights.get(asset.id).then(setRights);
    }
  }, [asset?.id]);

  if (!asset) {
    return (
      <aside className="asset-inspector">
        <EmptyState title={t("asset.selectPrompt")} />
      </aside>
    );
  }

  const currentAsset = asset;
  const currentPath = asset.importMode === "copy" && asset.storedPath ? asset.storedPath : asset.originalPath;
  const dirty = title !== (asset.title ?? "") || memo !== asset.memo;

  async function saveMeta(input?: { rating?: number; favorite?: boolean }): Promise<void> {
    setBusy(true);
    try {
      await window.suwolAudio.assets.update(currentAsset.id, {
        title: title.trim() || null,
        memo,
        rating: input?.rating ?? currentAsset.rating,
        favorite: input?.favorite ?? currentAsset.favorite,
      });
      showToast("success", t("inspector.saved"));
      await onRefresh();
    } catch {
      showToast("error", t("inspector.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function addToCollection(): Promise<void> {
    if (!collectionId) {
      return;
    }
    await window.suwolAudio.collections.addAssets({ collectionId, assetIds: [currentAsset.id] });
    setCollectionId("");
    showToast("success", t("collection.addAssets"));
    await onRefresh();
  }

  async function applySuggestedTags(tagNames: string[]): Promise<void> {
    await window.suwolAudio.analysis.applySuggestedTags({ assetId: currentAsset.id, tagNames, locale });
    showToast("success", t("analysis.recommendations.applySelected"));
    await onRefresh();
  }

  async function rerunAnalysis(): Promise<void> {
    setBusy(true);
    try {
      await window.suwolAudio.analysis.rerun(currentAsset.id);
      showToast("success", t("analysis.recommendations.rerun"));
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveRights(): Promise<void> {
    if (!rights) {
      return;
    }
    setRightsBusy(true);
    try {
      setRights(
        await window.suwolAudio.rights.update(currentAsset.id, {
          sourceName: rights.sourceName,
          sourceUrl: rights.sourceUrl,
          author: rights.author,
          licenseName: rights.licenseName,
          licenseUrl: rights.licenseUrl,
          attributionText: rights.attributionText,
          usageNotes: rights.usageNotes,
          commercialUseStatus: rights.commercialUseStatus,
          creditRequired: rights.creditRequired,
        }),
      );
      showToast("success", t("rights.saved"));
    } catch {
      showToast("error", t("error.RIGHTS_UPDATE_FAILED" as MessageKey));
    } finally {
      setRightsBusy(false);
    }
  }

  async function exportSidecar(): Promise<void> {
    const result = await window.suwolAudio.assets.exportSidecars({ assetIds: [currentAsset.id], overwrite: false });
    showToast(result.failed > 0 ? "warning" : "success", t("management.sidecarComplete", { count: format.number(result.success) }));
  }

  async function copyText(label: string, value: string): Promise<void> {
    await navigator.clipboard?.writeText(value);
    showToast("info", t("inspector.copied", { label }));
  }

  return (
    <aside className="asset-inspector" aria-label={t("inspector.title")}>
      <header className="inspector-header">
        <div>
          <h2>{asset.title || asset.fileName}</h2>
          <p title={currentPath}>{currentPath}</p>
        </div>
        <button
          className={asset.favorite ? "icon-button is-on" : "icon-button"}
          type="button"
          onClick={() => void saveMeta({ favorite: !asset.favorite })}
          title={t("asset.favorite")}
          aria-label={t("asset.favorite")}
        >
          <Heart size={16} aria-hidden="true" />
        </button>
      </header>

      <InspectorSection title={t("inspector.fileInfo")} defaultOpen>
        <dl className="inspector-meta-grid">
          <Metric label={t("asset.fileName")} value={asset.fileName} />
          <Metric label={t("asset.size")} value={format.fileSize(asset.fileSize)} />
          <Metric label={t("asset.format")} value={asset.audioAnalysis?.format ?? asset.fileExt} />
          <Metric label={t("asset.unplayable")} value={asset.playable ? "-" : t(`playbackReason.${asset.playbackSupportReason ?? "CODEC_UNSUPPORTED"}` as MessageKey)} />
        </dl>
        <div className="inspector-action-row">
          <button className="secondary-button compact" type="button" onClick={() => void copyText(t("asset.fileName"), asset.fileName)}>
            <Copy size={14} aria-hidden="true" />
            {t("asset.fileName")}
          </button>
          <button className="secondary-button compact" type="button" onClick={() => void copyText(t("inspector.path"), currentPath)}>
            <Copy size={14} aria-hidden="true" />
            {t("inspector.path")}
          </button>
          <button className="secondary-button compact" type="button" onClick={() => void copyText("ID", asset.id)}>
            <Copy size={14} aria-hidden="true" />
            ID
          </button>
        </div>
      </InspectorSection>

      <InspectorSection title={t("inspector.memoRating")} defaultOpen>
        <label>
          {t("inspector.titleField")}
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          {t("inspector.memo")}
          <textarea value={memo} rows={4} onChange={(event) => setMemo(event.target.value)} />
        </label>
        <div className="rating-buttons">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              className={asset.rating >= rating ? "icon-button is-on" : "icon-button"}
              type="button"
              onClick={() => void saveMeta({ rating })}
              title={`${t("asset.rating")} ${rating}`}
              aria-label={`${t("asset.rating")} ${rating}`}
            >
              <Star size={15} aria-hidden="true" />
            </button>
          ))}
          <button className="secondary-button compact" type="button" onClick={() => void saveMeta({ rating: 0 })}>
            {t("common.clear")}
          </button>
          <button className="secondary-button compact" type="button" onClick={() => void saveMeta()} disabled={busy || !dirty}>
            <Save size={15} aria-hidden="true" />
            {dirty ? t("inspector.saveChanges") : t("common.save")}
          </button>
        </div>
      </InspectorSection>

      <InspectorSection title={t("inspector.audioInfo")} defaultOpen>
        <WaveformPreview
          asset={asset}
          large
          currentTimeMs={playbackState.assetId === asset.id ? playbackState.currentTimeMs : undefined}
          durationMs={asset.audioAnalysis?.durationMs ?? playbackState.durationMs}
          pointA={playbackState.assetId === asset.id ? playbackState.pointA : null}
          pointB={playbackState.assetId === asset.id ? playbackState.pointB : null}
        />
        <dl className="inspector-meta-grid">
          <Metric label={t("asset.duration")} value={format.duration(asset.audioAnalysis?.durationMs)} />
          <Metric label={t("asset.sampleRate")} value={format.sampleRate(asset.audioAnalysis?.sampleRate)} />
          <Metric label={t("asset.channels")} value={format.channel(asset.audioAnalysis?.channels)} />
          <Metric label={t("asset.bitrate")} value={format.bitrate(asset.audioAnalysis?.bitrate)} />
          <Metric label={t("analysis.metric.peak")} value={formatDb(asset.audioAnalysis?.peakDb)} />
          <Metric label={t("analysis.metric.rms")} value={formatDb(asset.audioAnalysis?.rmsDb)} />
          <Metric label={t("analysis.metric.dynamicRange" as MessageKey)} value={formatDb(asset.audioFeatures?.dynamicRangeDb)} />
          <Metric label={t("analysis.metric.silenceStart")} value={format.duration(asset.audioAnalysis?.silenceStartMs)} />
          <Metric label={t("analysis.metric.silenceEnd")} value={format.duration(asset.audioAnalysis?.silenceEndMs)} />
          <Metric label={t("analysis.metric.loopLikelihood")} value={formatLoop(asset.audioAnalysis?.loopLikelihood, t)} />
          <Metric label={t("analysis.metric.loopScore")} value={formatScore(asset.audioAnalysis?.loopScore)} />
          <Metric label={t("analysis.metric.loopBoundary" as MessageKey)} value={formatScore(asset.audioFeatures?.loopBoundarySimilarity)} />
          <Metric label={t("asset.playCount")} value={format.number(asset.playCount)} />
          <Metric label={t("asset.lastPlayed")} value={format.dateTime(asset.lastPlayedAt)} />
        </dl>
        {asset.audioFeatures?.loopReasons.length ? (
          <ul className="reason-list">
            {asset.audioFeatures.loopReasons.map((reason) => (
              <li key={reason}>{t(`loop.reason.${reason}` as MessageKey)}</li>
            ))}
          </ul>
        ) : null}
      </InspectorSection>

      <InspectorSection title={t("inspector.tagsCollections")} defaultOpen>
        <TagEditor asset={asset} onRefresh={onRefresh} />
        <div className="tag-pill-list">
          {asset.collections.length === 0 ? <span className="muted">{t("collection.empty")}</span> : null}
          {asset.collections.map((collection) => (
            <span className="tag-pill" key={collection.id}>
              {collection.name}
            </span>
          ))}
        </div>
        <div className="inline-form">
          <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)} aria-label={t("collection.select")}>
            <option value="">{t("collection.select")}</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
          <button className="secondary-button compact" type="button" onClick={() => void addToCollection()}>
            {t("common.add")}
          </button>
        </div>
      </InspectorSection>

      <InspectorSection title={t("analysis.recommendations.title")}>
        <AudioAnalysisRecommendations
          analysis={asset.audioAnalysis}
          existingTags={asset.tags.map((tag) => tag.name)}
          disabled={busy}
          onApplyTags={applySuggestedTags}
          onAnalyzeAgain={rerunAnalysis}
        />
        <button className="secondary-button compact" type="button" onClick={() => void rerunAnalysis()} disabled={busy}>
          <RefreshCw size={15} aria-hidden="true" />
          {t("analysis.recommendations.rerun")}
        </button>
      </InspectorSection>

      <InspectorSection title={t("similarity.title" as MessageKey)}>
        <SimilarSoundsPanel
          asset={asset}
          disabled={busy}
          onPlayAsset={onPlayAsset}
          onCompareAsset={onCompareAsset}
          onRefresh={onRefresh}
        />
      </InspectorSection>

      <InspectorSection title={t("rights.title")}>
        {rights ? (
          <>
            <label>
              {t("rights.sourceName")}
              <input value={rights.sourceName} onChange={(event) => setRights({ ...rights, sourceName: event.target.value })} />
            </label>
            <label>
              {t("rights.sourceUrl")}
              <input value={rights.sourceUrl} onChange={(event) => setRights({ ...rights, sourceUrl: event.target.value })} />
            </label>
            <label>
              {t("rights.author")}
              <input value={rights.author} onChange={(event) => setRights({ ...rights, author: event.target.value })} />
            </label>
            <label>
              {t("rights.licenseName")}
              <input value={rights.licenseName} onChange={(event) => setRights({ ...rights, licenseName: event.target.value })} />
            </label>
            <label>
              {t("rights.licenseUrl")}
              <input value={rights.licenseUrl} onChange={(event) => setRights({ ...rights, licenseUrl: event.target.value })} />
            </label>
            <label>
              {t("rights.attributionText")}
              <textarea rows={3} value={rights.attributionText} onChange={(event) => setRights({ ...rights, attributionText: event.target.value })} />
            </label>
            <label>
              {t("rights.usageNotes")}
              <textarea rows={3} value={rights.usageNotes} onChange={(event) => setRights({ ...rights, usageNotes: event.target.value })} />
            </label>
            <label>
              {t("rights.commercialUseStatus")}
              <select
                value={rights.commercialUseStatus}
                onChange={(event) =>
                  setRights({ ...rights, commercialUseStatus: event.target.value as AssetRightsMetadata["commercialUseStatus"] })
                }
              >
                <option value="unknown">{t("rights.status.unknown")}</option>
                <option value="allowed">{t("rights.status.allowed")}</option>
                <option value="not_allowed">{t("rights.status.notAllowed")}</option>
                <option value="check_required">{t("rights.status.checkRequired")}</option>
              </select>
            </label>
            <label>
              {t("rights.creditRequired")}
              <select
                value={rights.creditRequired}
                onChange={(event) => setRights({ ...rights, creditRequired: event.target.value as AssetRightsMetadata["creditRequired"] })}
              >
                <option value="unknown">{t("rights.status.unknown")}</option>
                <option value="yes">{t("rights.status.yes")}</option>
                <option value="no">{t("rights.status.no")}</option>
              </select>
            </label>
            <button className="secondary-button compact" type="button" onClick={() => void saveRights()} disabled={rightsBusy}>
              <Save size={15} aria-hidden="true" />
              {t("common.save")}
            </button>
          </>
        ) : (
          <span className="muted">{t("common.loading")}</span>
        )}
      </InspectorSection>

      <InspectorSection title={t("inspector.export")}>
        <div className="inspector-action-row">
          <button className="secondary-button compact" type="button" onClick={onExportAsset}>
            <FileOutput size={15} aria-hidden="true" />
            {t("export.title")}
          </button>
          <button className="secondary-button compact" type="button" onClick={() => void exportSidecar()}>
            {t("management.sidecarExport")}
          </button>
        </div>
      </InspectorSection>
    </aside>
  );
}

function InspectorSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): JSX.Element {
  return (
    <details className="inspector-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="inspector-section-body">{children}</div>
    </details>
  );
}

function formatDb(value: number | null | undefined): string {
  return Number.isFinite(value) ? `${(value as number).toFixed(1)} dB` : "-";
}

function formatScore(value: number | null | undefined): string {
  return Number.isFinite(value) ? `${Math.round((value as number) * 100)}%` : "-";
}

function formatLoop(value: AudioAnalysisResult["loopLikelihood"] | undefined, t: (key: MessageKey) => string): string {
  if (value === "high") {
    return t("analysis.loop.high" as MessageKey);
  }
  if (value === "medium") {
    return t("analysis.loop.medium" as MessageKey);
  }
  if (value === "low") {
    return t("analysis.loop.low" as MessageKey);
  }
  return t("analysis.loop.unknown" as MessageKey);
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

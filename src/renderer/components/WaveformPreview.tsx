import type { WaveformBucket } from "../../shared/audio-analysis-types";
import type { AssetListItem } from "../../shared/library-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

const PLACEHOLDER_BARS = [0.2, 0.46, 0.32, 0.7, 0.52, 0.84, 0.4, 0.64, 0.3, 0.5, 0.74, 0.28];

interface WaveformPreviewProps {
  asset: AssetListItem;
  large?: boolean;
  currentTimeMs?: number;
  durationMs?: number;
  pointA?: number | null;
  pointB?: number | null;
}

export function WaveformPreview({
  asset,
  large = false,
  currentTimeMs,
  durationMs,
  pointA,
  pointB,
}: WaveformPreviewProps): JSX.Element {
  const { t } = useI18n();
  const buckets = asset.audioAnalysis?.waveformSummary?.buckets;
  const values = buckets?.length
    ? buckets.slice(0, 48).map((bucket) => Math.max(0.08, Math.min(1, bucket.peak || bucket.rms || 0.08)))
    : PLACEHOLDER_BARS;
  const markerPercent = percent(currentTimeMs, durationMs ?? asset.audioAnalysis?.durationMs);
  const pointAPercent = percent(pointA, durationMs ?? asset.audioAnalysis?.durationMs);
  const pointBPercent = percent(pointB, durationMs ?? asset.audioAnalysis?.durationMs);
  const resolvedDurationMs = durationMs ?? asset.audioAnalysis?.durationMs;
  const silenceMarkers = getSilenceMarkerPercents(
    asset.audioAnalysis?.silenceStartMs,
    asset.audioAnalysis?.silenceEndMs,
    resolvedDurationMs,
  );
  const peakPercent = getWaveformPeakMarkerPercent(buckets);
  const rmsLevel = normalizeDbLevel(asset.audioAnalysis?.rmsDb);
  const stateLabel = getWaveformStateLabel(asset, t, Boolean(buckets?.length));

  return (
    <div
      className={[
        "waveform-preview",
        large ? "is-large" : "",
        buckets?.length ? "" : "is-placeholder",
        !asset.playable ? "is-unplayable" : "",
      ].join(" ")}
      aria-label={stateLabel}
      title={stateLabel}
    >
      {values.map((value, index) => (
        <span key={`${asset.id}:${index}`} style={{ height: `${Math.max(8, value * 100)}%` }} />
      ))}
      {silenceMarkers.start !== null ? (
        <i className="waveform-silence is-start" style={{ width: `${silenceMarkers.start}%` }} aria-hidden="true" />
      ) : null}
      {silenceMarkers.end !== null ? (
        <i
          className="waveform-silence is-end"
          style={{ left: `${silenceMarkers.end}%`, width: `${100 - silenceMarkers.end}%` }}
          aria-hidden="true"
        />
      ) : null}
      {peakPercent !== null ? <i className="waveform-peak-marker" style={{ left: `${peakPercent}%` }} aria-hidden="true" /> : null}
      {rmsLevel !== null ? <i className="waveform-rms-bar" style={{ width: `${rmsLevel}%` }} aria-hidden="true" /> : null}
      {markerPercent !== null ? <i className="waveform-marker" style={{ left: `${markerPercent}%` }} /> : null}
      {pointAPercent !== null ? <i className="waveform-point is-a" style={{ left: `${pointAPercent}%` }} /> : null}
      {pointBPercent !== null ? <i className="waveform-point is-b" style={{ left: `${pointBPercent}%` }} /> : null}
      {!buckets?.length ? <em>{stateLabel}</em> : null}
    </div>
  );
}

function percent(valueMs: number | null | undefined, durationMs: number | null | undefined): number | null {
  if (!Number.isFinite(valueMs) || !Number.isFinite(durationMs) || !durationMs) {
    return null;
  }
  return Math.max(0, Math.min(100, ((valueMs as number) / (durationMs as number)) * 100));
}

export function getWaveformPeakMarkerPercent(
  buckets: WaveformBucket[] | undefined,
): number | null {
  if (!buckets?.length) {
    return null;
  }
  let peakIndex = 0;
  let peakValue = -1;
  for (let index = 0; index < buckets.length; index += 1) {
    const value = buckets[index]?.peak ?? 0;
    if (value > peakValue) {
      peakValue = value;
      peakIndex = index;
    }
  }
  return Math.max(0, Math.min(100, ((peakIndex + 0.5) / buckets.length) * 100));
}

export function getSilenceMarkerPercents(
  silenceStartMs: number | null | undefined,
  silenceEndMs: number | null | undefined,
  durationMs: number | null | undefined,
): { start: number | null; end: number | null } {
  const start = percent(silenceStartMs, durationMs);
  const endSilence = percent(silenceEndMs, durationMs);
  return {
    start: start !== null && start > 0 ? start : null,
    end: endSilence !== null && endSilence > 0 ? Math.max(0, 100 - endSilence) : null,
  };
}

function normalizeDbLevel(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(4, Math.min(100, (((value as number) + 80) / 80) * 100));
}

function getWaveformStateLabel(asset: AssetListItem, t: (key: MessageKey) => string, hasWaveform: boolean): string {
  if (hasWaveform) {
    return t("waveform.ready" as MessageKey);
  }
  if (!asset.playable) {
    return t("waveform.unplayable" as MessageKey);
  }
  if (asset.mediaType === "audio" && !asset.audioAnalysis) {
    return t("waveform.loading" as MessageKey);
  }
  return t("waveform.empty" as MessageKey);
}

import { Check, EyeOff, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  AudioAnalysisResult,
  AudioClassificationCandidate,
  LoopLikelihood,
  SuggestedAudioTag,
} from "../../shared/audio-analysis-types";
import {
  formatClassificationLabel,
  formatReason,
  formatSource,
  getSuggestedTagLabel,
} from "../i18n/analysis-labels";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";
import "../styles/audio-analysis-recommendations.css";

export interface AudioAnalysisRecommendationsProps {
  analysis: AudioAnalysisResult | null;
  existingTags?: string[];
  disabled?: boolean;
  onApplyTags: (tagNames: string[]) => Promise<void> | void;
  onIgnore?: () => Promise<void> | void;
  onAnalyzeAgain?: () => Promise<void> | void;
}

export function AudioAnalysisRecommendations({
  analysis,
  existingTags = [],
  disabled = false,
  onApplyTags,
  onIgnore,
  onAnalyzeAgain,
}: AudioAnalysisRecommendationsProps): JSX.Element {
  const { t, format } = useI18n();
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set());
  const existingTagNames = useMemo(
    () => new Set(existingTags.map((tag) => normalizeTagName(tag))),
    [existingTags],
  );

  const selectableSuggestions = useMemo(
    () =>
      (analysis?.suggestedTags ?? []).filter((tag) => {
        const label = getSuggestedTagLabel(tag, t);
        return !existingTagNames.has(normalizeTagName(label));
      }),
    [analysis?.suggestedTags, existingTagNames, t],
  );

  const selectedSuggestedTags = selectableSuggestions
    .filter((tag) => selectedTags.has(normalizeTagName(getSuggestedTagLabel(tag, t))))
    .map((tag) => getSuggestedTagLabel(tag, t));

  async function applyAll(): Promise<void> {
    await onApplyTags(selectableSuggestions.map((tag) => getSuggestedTagLabel(tag, t)));
    setSelectedTags(new Set());
  }

  async function applySelected(): Promise<void> {
    await onApplyTags(selectedSuggestedTags);
    setSelectedTags(new Set());
  }

  function toggleTag(tag: SuggestedAudioTag): void {
    const normalized = normalizeTagName(getSuggestedTagLabel(tag, t));
    setSelectedTags((current) => {
      const next = new Set(current);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  }

  if (!analysis) {
    return (
      <section className="audio-analysis-section" aria-label={t("analysis.recommendations.title")}>
        <div className="audio-analysis-header">
          <h3>{t("analysis.recommendations.title")}</h3>
          {onAnalyzeAgain ? (
            <button className="icon-button" type="button" onClick={onAnalyzeAgain} disabled={disabled} title={t("analysis.recommendations.rerun")}>
              <RefreshCw aria-hidden="true" size={16} />
            </button>
          ) : null}
        </div>
        <p className="audio-analysis-empty">{t("analysis.recommendations.empty")}</p>
      </section>
    );
  }

  return (
    <section className="audio-analysis-section" aria-label={t("analysis.recommendations.title")}>
      <div className="audio-analysis-header">
        <h3>{t("analysis.recommendations.title")}</h3>
        <div className="audio-analysis-actions">
          <button
            className="icon-button"
            type="button"
            onClick={applyAll}
            disabled={disabled || selectableSuggestions.length === 0}
            title={t("analysis.recommendations.applyAll")}
          >
            <Sparkles aria-hidden="true" size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={applySelected}
            disabled={disabled || selectedSuggestedTags.length === 0}
            title={t("analysis.recommendations.applySelected")}
          >
            <Check aria-hidden="true" size={16} />
          </button>
          {onIgnore ? (
            <button className="icon-button" type="button" onClick={onIgnore} disabled={disabled} title={t("analysis.recommendations.ignore")}>
              <EyeOff aria-hidden="true" size={16} />
            </button>
          ) : null}
          {onAnalyzeAgain ? (
            <button className="icon-button" type="button" onClick={onAnalyzeAgain} disabled={disabled} title={t("analysis.recommendations.rerun")}>
              <RefreshCw aria-hidden="true" size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="analysis-subsection">
        <h4>{t("analysis.recommendations.candidates")}</h4>
        <div className="candidate-list">
          {analysis.classification.map((candidate) => (
            <ClassificationPill key={candidate.type} candidate={candidate} />
          ))}
        </div>
      </div>

      <div className="analysis-subsection">
        <h4>{t("analysis.recommendations.tags")}</h4>
        <div className="tag-suggestion-list">
          {analysis.suggestedTags.map((tag) => {
            const label = getSuggestedTagLabel(tag, t);
            const normalized = normalizeTagName(label);
            const alreadyExists = existingTagNames.has(normalized);
            const checked = selectedTags.has(normalized);

            return (
              <label className={`tag-suggestion-row${alreadyExists ? " is-existing" : ""}`} key={`${label}:${tag.source}`}>
                <input type="checkbox" checked={checked} disabled={disabled || alreadyExists} onChange={() => toggleTag(tag)} />
                <span className="tag-suggestion-name">{label}</span>
                <span className="tag-suggestion-confidence">{formatPercent(tag.confidence)}</span>
                <span className="tag-suggestion-source">{formatSource(tag.source, t)}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="analysis-subsection">
        <h4>{t("analysis.recommendations.reasons")}</h4>
        <ul className="reason-list">
          {collectReasons(analysis).map((reason) => (
            <li key={reason}>{formatReason(reason, t)}</li>
          ))}
        </ul>
      </div>

      <dl className="audio-metric-grid">
        <Metric label={t("analysis.metric.loopLikelihood")} value={formatLoopLikelihood(analysis.loopLikelihood, analysis.loopScore, t)} />
        <Metric label={t("analysis.metric.peak")} value={formatDb(analysis.peakDb)} />
        <Metric label={t("analysis.metric.rms")} value={formatDb(analysis.rmsDb)} />
        <Metric label={t("analysis.metric.silenceStart")} value={format.duration(analysis.silenceStartMs)} />
        <Metric label={t("analysis.metric.silenceEnd")} value={format.duration(analysis.silenceEndMs)} />
        <Metric label={t("analysis.metric.duration")} value={format.duration(analysis.durationMs)} />
        <Metric label={t("analysis.metric.format")} value={analysis.format ?? "-"} />
        <Metric label={t("analysis.metric.sampleRate")} value={format.sampleRate(analysis.sampleRate)} />
        <Metric label={t("analysis.metric.channels")} value={format.channel(analysis.channels)} />
        <Metric label={t("analysis.metric.bitrate")} value={format.bitrate(analysis.bitrate)} />
      </dl>
    </section>
  );
}

function ClassificationPill({ candidate }: { candidate: AudioClassificationCandidate }): JSX.Element {
  const { t } = useI18n();
  return (
    <span className={`classification-pill classification-${candidate.type}`}>
      <span>{formatClassificationLabel(candidate.type, t)}</span>
      <strong>{formatPercent(candidate.confidence)}</strong>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="audio-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function collectReasons(analysis: AudioAnalysisResult): string[] {
  const reasons = new Set<string>();
  for (const candidate of analysis.classification) {
    candidate.reasons.slice(0, 3).forEach((reason) => reasons.add(reason));
  }
  for (const tag of analysis.suggestedTags) {
    tag.reasons.slice(0, 2).forEach((reason) => reasons.add(reason));
  }
  return Array.from(reasons).slice(0, 8);
}

function formatLoopLikelihood(likelihood: LoopLikelihood, loopScore: number | undefined, t: ReturnType<typeof useI18n>["t"]): string {
  const label = t(`analysis.loop.${likelihood}` as MessageKey);
  if (loopScore === undefined) {
    return label;
  }
  return `${label} (${formatPercent(loopScore)})`;
}

function formatPercent(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${Math.round(value * 100)}%`;
}

function formatDb(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(1)} dB`;
}

function normalizeTagName(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

import type {
  AudioAnalysisResult,
  AudioClassificationType,
} from "../shared/audio-analysis-types";
import { formatClassificationBadge } from "./i18n/analysis-labels";
import type { I18nContextValue } from "./i18n/I18nProvider";
import type { MessageKey } from "./i18n/i18n";

export type AudioAnalysisFilterId =
  | "candidate_music"
  | "candidate_sfx"
  | "candidate_ui_sound"
  | "candidate_voice"
  | "candidate_ambience"
  | "loop_high"
  | "duration_under_1s"
  | "duration_over_30s"
  | "silence_start"
  | "silence_end";

export interface AssetWithAudioAnalysis {
  audioAnalysis?: AudioAnalysisResult | null;
}

export interface AudioAnalysisFilterDefinition {
  id: AudioAnalysisFilterId;
  label: string;
}

export const AUDIO_ANALYSIS_FILTERS: AudioAnalysisFilterDefinition[] = [
  { id: "candidate_music", label: "classification.musicBadge" },
  { id: "candidate_sfx", label: "classification.sfxBadge" },
  { id: "candidate_ui_sound", label: "classification.ui_soundBadge" },
  { id: "candidate_voice", label: "classification.voiceBadge" },
  { id: "candidate_ambience", label: "classification.ambienceBadge" },
  { id: "loop_high", label: "filter.loopHigh" },
  { id: "duration_under_1s", label: "filter.shortUnder1s" },
  { id: "duration_over_30s", label: "filter.longOver30s" },
  { id: "silence_start", label: "analysis.metric.silenceStart" },
  { id: "silence_end", label: "analysis.metric.silenceEnd" },
];

export function matchesAudioAnalysisFilter(asset: AssetWithAudioAnalysis, filterId: AudioAnalysisFilterId): boolean {
  const analysis = asset.audioAnalysis;
  if (!analysis) {
    return false;
  }

  switch (filterId) {
    case "candidate_music":
      return hasClassification(analysis, "music");
    case "candidate_sfx":
      return hasClassification(analysis, "sfx");
    case "candidate_ui_sound":
      return hasClassification(analysis, "ui_sound");
    case "candidate_voice":
      return hasClassification(analysis, "voice");
    case "candidate_ambience":
      return hasClassification(analysis, "ambience");
    case "loop_high":
      return analysis.loopLikelihood === "high" || (analysis.loopScore ?? 0) >= 0.72;
    case "duration_under_1s":
      return (analysis.durationMs ?? Number.POSITIVE_INFINITY) <= 1000;
    case "duration_over_30s":
      return (analysis.durationMs ?? 0) >= 30000;
    case "silence_start":
      return (analysis.silenceStartMs ?? 0) >= 100;
    case "silence_end":
      return (analysis.silenceEndMs ?? 0) >= 100;
    default:
      return false;
  }
}

export function getAudioAnalysisBadgeLabels(
  analysis: AudioAnalysisResult | null | undefined,
  t: I18nContextValue["t"],
): string[] {
  if (!analysis) {
    return [];
  }

  return analysis.classification
    .filter((candidate) => candidate.type !== "unknown" && candidate.confidence >= 0.45)
    .slice(0, 3)
    .map((candidate) => formatClassificationBadge(candidate.type, t));
}

function hasClassification(analysis: AudioAnalysisResult, type: AudioClassificationType): boolean {
  return analysis.classification.some((candidate) => candidate.type === type && candidate.confidence >= 0.35);
}

export function getAudioAnalysisFilterLabel(filter: AudioAnalysisFilterDefinition, t: I18nContextValue["t"]): string {
  return t(filter.label as MessageKey);
}

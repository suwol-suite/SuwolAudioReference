import type {
  AudioClassificationType,
  SuggestedAudioTag,
  SuggestedTagSource,
} from "../../shared/audio-analysis-types";
import type { MessageKey } from "./i18n";
import type { I18nContextValue } from "./I18nProvider";

export function formatClassificationLabel(type: AudioClassificationType, t: I18nContextValue["t"]): string {
  return t(`classification.${type}` as MessageKey);
}

export function formatClassificationBadge(type: AudioClassificationType, t: I18nContextValue["t"]): string {
  return t(`classification.${type}Badge` as MessageKey);
}

export function formatReason(reason: string, t: I18nContextValue["t"]): string {
  const directKey = `reason.${reason}` as MessageKey;
  const direct = t(directKey);
  if (direct !== directKey) {
    return direct;
  }
  if (reason.includes("keyword")) {
    return t("reason.keyword");
  }
  return reason.replace(/_/g, " ");
}

export function formatSource(source: SuggestedTagSource, t: I18nContextValue["t"]): string {
  return t(`analysis.source.${source}` as MessageKey);
}

export function getSuggestedTagLabel(tag: SuggestedAudioTag, t: I18nContextValue["t"]): string {
  return tag.tagKey ? t(tag.tagKey as MessageKey) : tag.tag;
}

import type { Locale } from "./locales";

const SUGGESTED_TAG_LABELS: Record<string, Record<Locale, string>> = {
  "tag.bgm": { ko: "BGM", en: "BGM" },
  "tag.sfx": { ko: "효과음", en: "SFX" },
  "tag.uiSound": { ko: "UI사운드", en: "UI Sound" },
  "tag.click": { ko: "클릭", en: "Click" },
  "tag.button": { ko: "버튼", en: "Button" },
  "tag.alert": { ko: "알림", en: "Alert" },
  "tag.voice": { ko: "보이스", en: "Voice" },
  "tag.ambience": { ko: "앰비언스", en: "Ambience" },
  "tag.loopable": { ko: "루프가능", en: "Loopable" },
  "tag.short": { ko: "짧음", en: "Short" },
  "tag.long": { ko: "긴음", en: "Long" },
  "tag.retro8bit": { ko: "8비트", en: "8-bit" },
  "tag.retro16bit": { ko: "16비트", en: "16-bit" },
  "tag.retro": { ko: "레트로", en: "Retro" },
};

export function getSuggestedTagLabelByKey(tagKey: string | undefined, locale: Locale): string | null {
  if (!tagKey) {
    return null;
  }
  return SUGGESTED_TAG_LABELS[tagKey]?.[locale] ?? SUGGESTED_TAG_LABELS[tagKey]?.ko ?? null;
}

export const DEFAULT_LOCALE = "ko";

export const SUPPORTED_LOCALES = ["ko", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export interface LocaleOption {
  locale: Locale;
  label: string;
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { locale: "ko", label: "한국어" },
  { locale: "en", label: "English" },
];

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.startsWith("ko")) {
    return "ko";
  }
  if (normalized.startsWith("en")) {
    return "en";
  }
  return null;
}

export function resolveLocale(preferred?: string | null, osLocale?: string | null): Locale {
  return normalizeLocale(preferred) ?? normalizeLocale(osLocale) ?? DEFAULT_LOCALE;
}

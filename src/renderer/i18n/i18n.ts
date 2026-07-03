import type { AppErrorCode } from "../../shared/app-error-codes";
import { DEFAULT_LOCALE, type Locale } from "../../shared/i18n/locales";
import koMessages from "./locales/ko.json";
import enMessages from "./locales/en.json";

export type MessageKey = keyof typeof koMessages;
export type MessageParams = Record<string, string | number | boolean | null | undefined>;

const MESSAGES: Record<Locale, Record<string, string>> = {
  ko: koMessages,
  en: enMessages,
};

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = lookup(locale, key);
  return interpolate(template, params);
}

export function translateError(locale: Locale, code: AppErrorCode, params?: MessageParams): string {
  return translate(locale, `error.${code}` as MessageKey, params);
}

export function lookup(locale: Locale, key: string): string {
  const value = MESSAGES[locale]?.[key] ?? MESSAGES.ko[key] ?? MESSAGES.en[key];
  if (value === undefined) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing message key: ${key}`);
    }
    return key;
  }
  return value;
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export const INITIAL_LOCALE: Locale = DEFAULT_LOCALE;

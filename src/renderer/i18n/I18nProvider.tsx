import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "../../shared/i18n/locales";
import { DEFAULT_LOCALE, LOCALE_OPTIONS } from "../../shared/i18n/locales";
import { createFormatters, type I18nFormatters } from "./formatters";
import { translate, translateError, type MessageKey, type MessageParams } from "./i18n";
import type { AppErrorCode } from "../../shared/app-error-codes";

export interface I18nContextValue {
  locale: Locale;
  localeOptions: typeof LOCALE_OPTIONS;
  ready: boolean;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: MessageKey, params?: MessageParams) => string;
  tError: (code: AppErrorCode, params?: MessageParams) => string;
  format: I18nFormatters;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let canceled = false;
    async function load(): Promise<void> {
      try {
        const settings = await window.suwolAudio.settings.get();
        if (!canceled) {
          setLocaleState(settings.locale);
        }
      } finally {
        if (!canceled) {
          setReady(true);
        }
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const format = createFormatters(locale);
    return {
      locale,
      localeOptions: LOCALE_OPTIONS,
      ready,
      async setLocale(nextLocale) {
        setLocaleState(nextLocale);
        await window.suwolAudio.settings.setLocale(nextLocale);
      },
      t: (key, params) => translate(locale, key, params),
      tError: (code, params) => translateError(locale, code, params),
      format,
    };
  }, [locale, ready]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

import type { Locale } from "./i18n/locales";

export interface AppSettings {
  locale: Locale;
  theme: "dark";
  quickPreviewEnabled: boolean;
  quickPreviewMaxDurationMs: number;
  quickPreviewAutoPlayShortSounds: boolean;
  stopPreviousOnSelectionChange: boolean;
}

export type QuickPreviewSettingsInput = Partial<
  Pick<
    AppSettings,
    | "quickPreviewEnabled"
    | "quickPreviewMaxDurationMs"
    | "quickPreviewAutoPlayShortSounds"
    | "stopPreviousOnSelectionChange"
  >
>;

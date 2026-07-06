import type { Locale } from "./i18n/locales";
import type { UpdateSettings, UpdateSettingsInput } from "./update-types";

export interface AppSettings {
  locale: Locale;
  theme: "dark";
  quickPreviewEnabled: boolean;
  quickPreviewMaxDurationMs: number;
  quickPreviewAutoPlayShortSounds: boolean;
  stopPreviousOnSelectionChange: boolean;
  updates: UpdateSettings;
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

export type AppUpdateSettingsInput = UpdateSettingsInput;

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { app } from "electron";
import { DEFAULT_LOCALE, isSupportedLocale, resolveLocale, type Locale } from "../../shared/i18n/locales";
import type { AppSettings, QuickPreviewSettingsInput } from "../../shared/settings-types";

const DEFAULT_SETTINGS: AppSettings = {
  locale: DEFAULT_LOCALE,
  theme: "dark",
  quickPreviewEnabled: false,
  quickPreviewMaxDurationMs: 3000,
  quickPreviewAutoPlayShortSounds: false,
  stopPreviousOnSelectionChange: true,
};

export class SettingsService {
  constructor(private readonly settingsPath: string) {}

  async read(): Promise<AppSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.settingsPath, "utf8")) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        locale: resolveLocale(parsed.locale, app.getLocale()),
        quickPreviewMaxDurationMs: normalizeQuickPreviewDuration(parsed.quickPreviewMaxDurationMs),
      };
    } catch {
      return {
        ...DEFAULT_SETTINGS,
        locale: resolveLocale(null, app.getLocale()),
      };
    }
  }

  async write(settings: AppSettings): Promise<void> {
    await mkdir(dirname(this.settingsPath), { recursive: true });
    await writeFile(this.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }

  async setLocale(locale: Locale): Promise<AppSettings> {
    if (!isSupportedLocale(locale)) {
      throw new Error(`Unsupported locale: ${locale}`);
    }
    const next = { ...(await this.read()), locale };
    await this.write(next);
    return next;
  }

  async updateQuickPreview(input: QuickPreviewSettingsInput): Promise<AppSettings> {
    const current = await this.read();
    const next: AppSettings = {
      ...current,
      quickPreviewEnabled: input.quickPreviewEnabled ?? current.quickPreviewEnabled,
      quickPreviewMaxDurationMs: normalizeQuickPreviewDuration(
        input.quickPreviewMaxDurationMs ?? current.quickPreviewMaxDurationMs,
      ),
      quickPreviewAutoPlayShortSounds:
        input.quickPreviewAutoPlayShortSounds ?? current.quickPreviewAutoPlayShortSounds,
      stopPreviousOnSelectionChange: input.stopPreviousOnSelectionChange ?? current.stopPreviousOnSelectionChange,
    };
    await this.write(next);
    return next;
  }
}

function normalizeQuickPreviewDuration(value: unknown): number {
  const duration = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_SETTINGS.quickPreviewMaxDurationMs;
  return Math.max(300, Math.min(15000, Math.round(duration)));
}

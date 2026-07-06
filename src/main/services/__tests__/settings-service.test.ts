import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getLocale: () => "en-US",
  },
}));

describe("settings-service", () => {
  it("loads OS locale when no settings file exists and persists explicit locale", async () => {
    const { SettingsService } = await import("../settings-service");
    const directory = join(tmpdir(), `suwol-audio-settings-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    const service = new SettingsService(join(directory, "settings.json"));

    expect(await service.read()).toMatchObject({
      locale: "en",
      updates: {
        checkOnStartup: false,
        autoDownload: false,
        linuxAppImageOnly: true,
      },
    });
    await service.setLocale("ko");
    expect((await service.read()).locale).toBe("ko");
  });

  it("persists quick preview settings with duration clamping", async () => {
    const { SettingsService } = await import("../settings-service");
    const directory = join(tmpdir(), `suwol-audio-settings-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    const service = new SettingsService(join(directory, "settings.json"));

    const updated = await service.updateQuickPreview({
      quickPreviewEnabled: true,
      quickPreviewAutoPlayShortSounds: true,
      quickPreviewMaxDurationMs: 60000,
      stopPreviousOnSelectionChange: false,
    });

    expect(updated).toMatchObject({
      quickPreviewEnabled: true,
      quickPreviewAutoPlayShortSounds: true,
      quickPreviewMaxDurationMs: 15000,
      stopPreviousOnSelectionChange: false,
    });
    expect(await service.read()).toMatchObject(updated);
  });

  it("persists update settings while keeping Linux AppImage policy locked", async () => {
    const { SettingsService } = await import("../settings-service");
    const directory = join(tmpdir(), `suwol-audio-settings-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    const service = new SettingsService(join(directory, "settings.json"));

    const updated = await service.updateUpdates({
      checkOnStartup: true,
      autoDownload: true,
    });

    expect(updated.updates).toEqual({
      checkOnStartup: true,
      autoDownload: true,
      linuxAppImageOnly: true,
    });
    expect((await service.read()).updates).toEqual(updated.updates);
  });
});

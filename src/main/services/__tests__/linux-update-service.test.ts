import { describe, expect, it, vi } from "vitest";
import {
  LinuxUpdateService,
  resolveLinuxUpdateSupport,
  type LinuxUpdaterAdapter,
} from "../linux-update-service";

describe("linux-update-service", () => {
  it("enables updates only for packaged Linux AppImage builds", () => {
    expect(resolveLinuxUpdateSupport({ platform: "linux", isPackaged: true, appImagePath: "/tmp/app.AppImage" })).toEqual({
      supported: true,
      supportReason: "linux_appimage",
    });
    expect(resolveLinuxUpdateSupport({ platform: "win32", isPackaged: true, appImagePath: undefined })).toEqual({
      supported: false,
      supportReason: "unsupported_platform",
    });
    expect(resolveLinuxUpdateSupport({ platform: "linux", isPackaged: true, appImagePath: undefined })).toEqual({
      supported: false,
      supportReason: "unsupported_package",
    });
    expect(resolveLinuxUpdateSupport({ platform: "linux", isPackaged: false, appImagePath: "/tmp/app.AppImage" })).toEqual({
      supported: false,
      supportReason: "dev_mode",
    });
  });

  it("maps update available, progress, and downloaded events into safe state", async () => {
    const adapter = new FakeUpdaterAdapter();
    const service = createService(adapter);
    const states: string[] = [];
    service.onStateChanged((state) => states.push(state.status));

    adapter.onCheck = async () => {
      adapter.emit("checking-for-update");
      adapter.emit("update-available", { version: "0.1.3" });
    };
    adapter.onDownload = async () => {
      adapter.emit("download-progress", {
        percent: 55.5,
        transferred: 512,
        total: 1024,
        bytesPerSecond: 256,
      });
      adapter.emit("update-downloaded", { version: "0.1.3" });
    };

    await service.checkForUpdates();
    expect(service.getState()).toMatchObject({ status: "available", availableVersion: "0.1.3" });

    await service.downloadUpdate();
    expect(service.getState()).toMatchObject({ status: "downloaded", downloadedVersion: "0.1.3" });
    expect(states).toContain("checking");
    expect(states).toContain("available");
    expect(states).toContain("downloading");
    expect(states.at(-1)).toBe("downloaded");
    expect(adapter.autoDownload).toBe(false);
    expect(adapter.autoInstallOnAppQuit).toBe(false);
  });

  it("auto-downloads only when the caller explicitly enables it", async () => {
    const adapter = new FakeUpdaterAdapter();
    const service = createService(adapter);
    adapter.onCheck = async () => adapter.emit("update-available", { version: "0.1.3" });
    adapter.onDownload = async () => adapter.emit("update-downloaded", { version: "0.1.3" });

    await service.checkForUpdates({ autoDownload: true });
    await Promise.resolve();

    expect(adapter.downloadCalls).toBe(1);
    expect(service.getState()).toMatchObject({ status: "downloaded", downloadedVersion: "0.1.3" });
  });

  it("keeps unsupported platforms disabled and never creates an updater", async () => {
    const createUpdater = vi.fn<() => Promise<LinuxUpdaterAdapter>>();
    const service = new LinuxUpdateService({
      platform: "win32",
      isPackaged: true,
      currentVersion: "0.1.2",
      logger: silentLogger,
      createUpdater,
    });

    const state = await service.checkForUpdates();

    expect(state).toMatchObject({
      supported: false,
      supportReason: "unsupported_platform",
      status: "disabled",
      errorCode: "UPDATE_UNSUPPORTED_PLATFORM",
    });
    expect(createUpdater).not.toHaveBeenCalled();
  });

  it("maps check failures without exposing raw stacks", async () => {
    const adapter = new FakeUpdaterAdapter();
    const service = createService(adapter);
    adapter.onCheck = async () => {
      throw new Error("metadata unavailable");
    };

    await service.checkForUpdates();

    expect(service.getState()).toMatchObject({
      status: "error",
      errorCode: "UPDATE_CHECK_FAILED",
      errorMessage: "metadata unavailable",
    });
  });
});

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function createService(adapter: LinuxUpdaterAdapter): LinuxUpdateService {
  return new LinuxUpdateService({
    platform: "linux",
    isPackaged: true,
    appImagePath: "/tmp/SuwolAudioReference.AppImage",
    currentVersion: "0.1.2",
    logger: silentLogger,
    createUpdater: async () => adapter,
  });
}

class FakeUpdaterAdapter implements LinuxUpdaterAdapter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  downloadCalls = 0;
  onCheck: () => Promise<void> = async () => {};
  onDownload: () => Promise<void> = async () => {};
  private readonly listeners = new Map<string, Array<(payload?: unknown) => void>>();

  setAutoDownload(autoDownload: boolean): void {
    this.autoDownload = autoDownload;
  }

  setAutoInstallOnAppQuit(autoInstallOnAppQuit: boolean): void {
    this.autoInstallOnAppQuit = autoInstallOnAppQuit;
  }

  on(event: string, listener: (payload?: unknown) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  async checkForUpdates(): Promise<void> {
    await this.onCheck();
  }

  async downloadUpdate(): Promise<void> {
    this.downloadCalls += 1;
    await this.onDownload();
  }

  quitAndInstall(): void {}

  emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}

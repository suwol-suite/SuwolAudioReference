import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import type {
  UpdateErrorCode,
  UpdatePlatformSupport,
  UpdateProgress,
  UpdateSettings,
  UpdateState,
} from "../../shared/update-types";
import type { LoggerService } from "./logger-service";

const RELEASE_PAGE_URL = "https://github.com/suwol-suite/SuwolAudioReference/releases";

type UpdateOperation = "check" | "download" | "install";
type UpdateEvent =
  | "checking-for-update"
  | "update-available"
  | "update-not-available"
  | "download-progress"
  | "update-downloaded"
  | "error";

export interface LinuxUpdateSupportInput {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  appImagePath?: string;
}

export interface LinuxUpdaterAdapter {
  setAutoDownload(autoDownload: boolean): void;
  setAutoInstallOnAppQuit(autoInstallOnAppQuit: boolean): void;
  on(event: UpdateEvent, listener: (...args: any[]) => void): void;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface LinuxUpdateServiceOptions extends LinuxUpdateSupportInput {
  currentVersion: string;
  logger: Pick<LoggerService, "info" | "warn" | "error">;
  createUpdater?: () => Promise<LinuxUpdaterAdapter>;
  openReleasePage?: (url: string) => Promise<unknown>;
}

export interface CheckForUpdatesOptions {
  autoDownload?: boolean;
  silent?: boolean;
}

export function resolveLinuxUpdateSupport(input: LinuxUpdateSupportInput): {
  supported: boolean;
  supportReason: UpdatePlatformSupport;
} {
  if (!input.isPackaged) {
    return { supported: false, supportReason: "dev_mode" };
  }
  if (input.platform !== "linux") {
    return { supported: false, supportReason: "unsupported_platform" };
  }
  if (!input.appImagePath) {
    return { supported: false, supportReason: "unsupported_package" };
  }
  return { supported: true, supportReason: "linux_appimage" };
}

export class LinuxUpdateService {
  private state: UpdateState;
  private updaterPromise: Promise<LinuxUpdaterAdapter> | null = null;
  private listenersRegistered = false;
  private operation: UpdateOperation | null = null;
  private pendingAutoDownload = false;
  private readonly listeners = new Set<(state: UpdateState) => void>();

  constructor(private readonly options: LinuxUpdateServiceOptions) {
    const support = resolveLinuxUpdateSupport(options);
    this.state = {
      supported: support.supported,
      supportReason: support.supportReason,
      status: support.supported ? "idle" : "disabled",
      currentVersion: options.currentVersion,
    };
    void this.log("info", `update support=${this.state.supportReason} supported=${this.state.supported}`);
  }

  getState(): UpdateState {
    return { ...this.state, progress: this.state.progress ? { ...this.state.progress } : undefined };
  }

  isSupported(): boolean {
    return this.state.supported;
  }

  onStateChanged(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async checkForUpdates(options: CheckForUpdatesOptions = {}): Promise<UpdateState> {
    if (!this.isSupported()) {
      return this.setUnsupportedError("UPDATE_UNSUPPORTED_PACKAGE");
    }
    if (this.state.status === "checking" || this.state.status === "downloading") {
      return this.getState();
    }
    try {
      const updater = await this.getUpdater();
      this.operation = "check";
      this.pendingAutoDownload = options.autoDownload === true;
      this.setState({
        status: "checking",
        errorCode: undefined,
        errorMessage: undefined,
        progress: undefined,
      });
      if (!options.silent) {
        await this.log("info", "update check started");
      }
      await updater.checkForUpdates();
      return this.getState();
    } catch (error) {
      this.fail("UPDATE_CHECK_FAILED", error);
      return this.getState();
    } finally {
      if (this.operation === "check") {
        this.operation = null;
      }
    }
  }

  async downloadUpdate(): Promise<UpdateState> {
    if (!this.isSupported()) {
      return this.setUnsupportedError("UPDATE_UNSUPPORTED_PACKAGE");
    }
    if (this.state.status === "downloading") {
      return this.getState();
    }
    try {
      const updater = await this.getUpdater();
      this.operation = "download";
      this.setState({
        status: "downloading",
        errorCode: undefined,
        errorMessage: undefined,
        progress: undefined,
      });
      await this.log("info", "update download requested");
      await updater.downloadUpdate();
      return this.getState();
    } catch (error) {
      this.fail("UPDATE_DOWNLOAD_FAILED", error);
      return this.getState();
    } finally {
      if (this.operation === "download") {
        this.operation = null;
      }
    }
  }

  async installUpdate(): Promise<UpdateState> {
    if (!this.isSupported()) {
      return this.setUnsupportedError("UPDATE_UNSUPPORTED_PACKAGE");
    }
    try {
      const updater = await this.getUpdater();
      this.operation = "install";
      await this.log("info", "update install requested");
      updater.quitAndInstall();
      return this.getState();
    } catch (error) {
      this.fail("UPDATE_INSTALL_FAILED", error);
      return this.getState();
    } finally {
      if (this.operation === "install") {
        this.operation = null;
      }
    }
  }

  async openReleasePage(): Promise<UpdateState> {
    try {
      await this.options.openReleasePage?.(RELEASE_PAGE_URL);
      await this.log("info", "update release page opened");
    } catch (error) {
      await this.log("warn", `update release page open failed: ${safeErrorMessage(error)}`);
    }
    return this.getState();
  }

  async checkOnStartup(settings: UpdateSettings): Promise<UpdateState> {
    if (!settings.checkOnStartup || !this.isSupported()) {
      return this.getState();
    }
    return this.checkForUpdates({ silent: true, autoDownload: settings.autoDownload });
  }

  private async getUpdater(): Promise<LinuxUpdaterAdapter> {
    if (!this.updaterPromise) {
      this.updaterPromise = (this.options.createUpdater ?? createElectronUpdaterAdapter)();
    }
    const updater = await this.updaterPromise;
    if (!this.listenersRegistered) {
      updater.setAutoDownload(false);
      updater.setAutoInstallOnAppQuit(false);
      this.registerUpdaterListeners(updater);
      this.listenersRegistered = true;
    }
    return updater;
  }

  private registerUpdaterListeners(updater: LinuxUpdaterAdapter): void {
    updater.on("checking-for-update", () => {
      void this.log("info", "update checking-for-update");
      this.setState({ status: "checking", progress: undefined });
    });
    updater.on("update-available", (info) => {
      void this.log("info", `update available version=${info.version}`);
      this.setState({
        status: "available",
        availableVersion: info.version,
        errorCode: undefined,
        errorMessage: undefined,
        progress: undefined,
      });
      if (this.pendingAutoDownload) {
        void this.downloadUpdate();
      }
    });
    updater.on("update-not-available", (info) => {
      void this.log("info", `update not available version=${info.version}`);
      this.setState({
        status: "not_available",
        availableVersion: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        progress: undefined,
      });
    });
    updater.on("download-progress", (progress) => {
      this.setState({
        status: "downloading",
        progress: mapProgress(progress),
        errorCode: undefined,
        errorMessage: undefined,
      });
    });
    updater.on("update-downloaded", (info) => {
      void this.log("info", `update downloaded version=${info.version}`);
      this.setState({
        status: "downloaded",
        downloadedVersion: info.version,
        availableVersion: info.version,
        progress: undefined,
        errorCode: undefined,
        errorMessage: undefined,
      });
    });
    updater.on("error", (error) => {
      this.fail(codeForOperation(this.operation), error);
    });
  }

  private setUnsupportedError(fallbackCode: UpdateErrorCode): UpdateState {
    const errorCode =
      this.state.supportReason === "unsupported_platform" ? "UPDATE_UNSUPPORTED_PLATFORM" : fallbackCode;
    return this.setState({ status: "disabled", errorCode });
  }

  private fail(errorCode: UpdateErrorCode, error: unknown): void {
    const errorMessage = safeErrorMessage(error);
    void this.log("error", `update error code=${errorCode} message=${errorMessage}`);
    this.setState({
      status: "error",
      errorCode,
      errorMessage,
      progress: undefined,
    });
  }

  private setState(next: Partial<UpdateState>): UpdateState {
    this.state = {
      ...this.state,
      ...next,
      supported: this.state.supported,
      supportReason: this.state.supportReason,
      currentVersion: this.state.currentVersion,
    };
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  private async log(level: "info" | "warn" | "error", message: string): Promise<void> {
    try {
      await this.options.logger[level](`[updates] ${message}`);
    } catch {
      // Logging must never break update flow.
    }
  }
}

export function createLinuxUpdateService(options: LinuxUpdateServiceOptions): LinuxUpdateService {
  return new LinuxUpdateService(options);
}

export async function createElectronUpdaterAdapter(): Promise<LinuxUpdaterAdapter> {
  const updaterModule = await import("electron-updater");
  const moduleDefault = updaterModule.default as { autoUpdater?: AppUpdater } | undefined;
  const autoUpdater = updaterModule.autoUpdater ?? moduleDefault?.autoUpdater;
  if (!autoUpdater) {
    throw new Error("electron-updater autoUpdater is unavailable");
  }
  return {
    setAutoDownload(autoDownload) {
      autoUpdater.autoDownload = autoDownload;
    },
    setAutoInstallOnAppQuit(autoInstallOnAppQuit) {
      autoUpdater.autoInstallOnAppQuit = autoInstallOnAppQuit;
    },
    on(event: UpdateEvent, listener: (...args: never[]) => void) {
      autoUpdater.on(event, listener);
    },
    checkForUpdates: () => autoUpdater.checkForUpdates(),
    downloadUpdate: () => autoUpdater.downloadUpdate(),
    quitAndInstall: () => autoUpdater.quitAndInstall(false, true),
  };
}

function codeForOperation(operation: UpdateOperation | null): UpdateErrorCode {
  if (operation === "download") {
    return "UPDATE_DOWNLOAD_FAILED";
  }
  if (operation === "install") {
    return "UPDATE_INSTALL_FAILED";
  }
  return "UPDATE_CHECK_FAILED";
}

function mapProgress(progress: ProgressInfo): UpdateProgress {
  return {
    percent: clampPercent(progress.percent),
    transferred: Math.max(0, Math.round(progress.transferred ?? 0)),
    total: Math.max(0, Math.round(progress.total ?? 0)),
    bytesPerSecond: Math.max(0, Math.round(progress.bytesPerSecond ?? 0)),
  };
}

function clampPercent(value: unknown): number {
  const percent = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, percent));
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Update failed";
}

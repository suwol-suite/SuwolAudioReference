import { existsSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME } from "../../shared/app-metadata";
import type {
  ReleaseAssetExpectation,
  ReleaseAutoUpdateReason,
  ReleaseChecksumCommand,
  ReleaseDistributionKind,
  ReleaseStatus,
  ReleaseStatusErrorCode,
} from "../../shared/release-status-types";
import type { LoggerService } from "./logger-service";

export const RELEASE_PAGE_URL = "https://github.com/suwol-suite/SuwolAudioReference/releases";
export const LATEST_RELEASE_URL = "https://github.com/suwol-suite/SuwolAudioReference/releases/latest";
export const CHECKSUM_HELP_URL = "https://github.com/suwol-suite/SuwolAudioReference#github-releases";
export const RELEASE_PUBLIC_KEY_FILE_NAME = "suwol-release-public-key.asc";

export interface ReleaseStatusSupportInput {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  appImagePath?: string;
}

export interface ReleaseStatusServiceOptions extends ReleaseStatusSupportInput {
  currentVersion: string;
  appName?: string;
  projectRoot?: string;
  publicKeyPath?: string;
  logger?: Pick<LoggerService, "info" | "warn">;
  openExternal?: (url: string) => Promise<unknown>;
}

export function resolveReleaseDistribution(input: ReleaseStatusSupportInput): {
  distributionKind: ReleaseDistributionKind;
  autoUpdateSupported: boolean;
  autoUpdateReason: ReleaseAutoUpdateReason;
} {
  if (!input.isPackaged) {
    return {
      distributionKind: "development",
      autoUpdateSupported: false,
      autoUpdateReason: "development",
    };
  }
  if (input.platform === "linux" && input.appImagePath) {
    return {
      distributionKind: "linux_appimage",
      autoUpdateSupported: true,
      autoUpdateReason: "linux_appimage",
    };
  }
  if (input.platform === "linux") {
    return {
      distributionKind: "linux_tarball_or_zip",
      autoUpdateSupported: false,
      autoUpdateReason: "linux_manual",
    };
  }
  if (input.platform === "win32") {
    return {
      distributionKind: "windows_zip",
      autoUpdateSupported: false,
      autoUpdateReason: "windows_manual",
    };
  }
  return {
    distributionKind: "unsupported_platform",
    autoUpdateSupported: false,
    autoUpdateReason: "unsupported_platform",
  };
}

export function buildExpectedReleaseAssets(version: string, appName = APP_NAME): ReleaseAssetExpectation[] {
  const productSlug = appName.replace(/\s+/g, ".");
  const packageSlug = appName.replace(/\s+/g, "-").toLowerCase();
  const appImageName = `${appName}-${version}.AppImage`;
  return [
    {
      kind: "windows_zip",
      fileName: `${productSlug}.${version}.Windows.x64.zip`,
      requiredFor: "manual_download",
    },
    {
      kind: "linux_zip",
      fileName: `${productSlug}.${version}.Linux.x64.zip`,
      requiredFor: "manual_download",
    },
    {
      kind: "linux_appimage",
      fileName: appImageName,
      requiredFor: "linux_auto_update",
    },
    {
      kind: "linux_tarball",
      fileName: `${packageSlug}-${version}.tar.gz`,
      requiredFor: "manual_download",
    },
    {
      kind: "linux_update_metadata",
      fileName: "latest-linux.yml",
      requiredFor: "linux_auto_update",
    },
    {
      kind: "linux_blockmap",
      fileName: `${appImageName}.blockmap`,
      requiredFor: "linux_auto_update",
    },
    {
      kind: "zip_checksums",
      fileName: "SHA256SUMS.txt",
      requiredFor: "verification",
    },
    {
      kind: "linux_checksums",
      fileName: "checksums.txt",
      requiredFor: "verification",
    },
    {
      kind: "signed_linux_checksums",
      fileName: "checksums.txt.asc",
      requiredFor: "verification",
    },
    {
      kind: "public_key",
      fileName: RELEASE_PUBLIC_KEY_FILE_NAME,
      requiredFor: "verification",
    },
  ];
}

export function buildChecksumCommands(version: string, appName = APP_NAME): ReleaseChecksumCommand[] {
  return [
    {
      id: "windows_hash",
      platform: "windows",
      command: formatWindowsChecksumCommand(version, appName),
    },
    {
      id: "linux_import_key",
      platform: "linux",
      command: `gpg --import ${RELEASE_PUBLIC_KEY_FILE_NAME}`,
    },
    {
      id: "linux_verify_signature",
      platform: "linux",
      command: "gpg --verify checksums.txt.asc checksums.txt",
    },
    {
      id: "linux_verify_checksums",
      platform: "linux",
      command: "shasum -a 256 -c checksums.txt",
    },
    {
      id: "linux_hash_appimage",
      platform: "linux",
      command: formatLinuxAppImageChecksumCommand(version, appName),
    },
  ];
}

export function formatWindowsChecksumCommand(version: string, appName = APP_NAME): string {
  const productSlug = appName.replace(/\s+/g, ".");
  return `Get-FileHash ".\\${productSlug}.${version}.Windows.x64.zip" -Algorithm SHA256`;
}

export function formatLinuxAppImageChecksumCommand(version: string, appName = APP_NAME): string {
  return `sha256sum ${quoteShellArg(`${appName}-${version}.AppImage`)}`;
}

export class ReleaseStatusService {
  private lastErrorCode: ReleaseStatusErrorCode | undefined;
  private lastErrorMessage: string | undefined;

  constructor(private readonly options: ReleaseStatusServiceOptions) {}

  getStatus(): ReleaseStatus {
    const appName = this.options.appName ?? APP_NAME;
    const support = resolveReleaseDistribution(this.options);
    return {
      appName,
      currentVersion: this.options.currentVersion,
      platform: this.options.platform,
      isPackaged: this.options.isPackaged,
      distributionKind: support.distributionKind,
      autoUpdateSupported: support.autoUpdateSupported,
      autoUpdateReason: support.autoUpdateReason,
      releasePageUrl: RELEASE_PAGE_URL,
      latestReleaseUrl: LATEST_RELEASE_URL,
      checksumHelpUrl: CHECKSUM_HELP_URL,
      expectedAssets: buildExpectedReleaseAssets(this.options.currentVersion, appName),
      checksumCommands: buildChecksumCommands(this.options.currentVersion, appName),
      publicKey: {
        fileName: RELEASE_PUBLIC_KEY_FILE_NAME,
        available: isFileAvailable(resolvePublicKeyPath(this.options)),
      },
      lastErrorCode: this.lastErrorCode,
      lastErrorMessage: this.lastErrorMessage,
    };
  }

  async openReleases(): Promise<ReleaseStatus> {
    return this.open(RELEASE_PAGE_URL, "RELEASE_PAGE_OPEN_FAILED", "release page");
  }

  async openLatestRelease(): Promise<ReleaseStatus> {
    return this.open(LATEST_RELEASE_URL, "RELEASE_PAGE_OPEN_FAILED", "latest release page");
  }

  async openChecksumsHelp(): Promise<ReleaseStatus> {
    return this.open(CHECKSUM_HELP_URL, "CHECKSUM_HELP_OPEN_FAILED", "checksum help");
  }

  private async open(url: string, errorCode: ReleaseStatusErrorCode, label: string): Promise<ReleaseStatus> {
    try {
      await this.options.openExternal?.(url);
      this.lastErrorCode = undefined;
      this.lastErrorMessage = undefined;
      await this.log("info", `${label} opened`);
    } catch (error) {
      this.lastErrorCode = errorCode;
      this.lastErrorMessage = safeErrorMessage(error);
      await this.log("warn", `${label} open failed: ${this.lastErrorMessage}`);
    }
    return this.getStatus();
  }

  private async log(level: "info" | "warn", message: string): Promise<void> {
    try {
      await this.options.logger?.[level]?.(`[release-status] ${message}`);
    } catch {
      // Release status must stay readable even when logging is unavailable.
    }
  }
}

export function createReleaseStatusService(options: ReleaseStatusServiceOptions): ReleaseStatusService {
  return new ReleaseStatusService(options);
}

function resolvePublicKeyPath(options: ReleaseStatusServiceOptions): string {
  return options.publicKeyPath ?? join(options.projectRoot ?? process.cwd(), RELEASE_PUBLIC_KEY_FILE_NAME);
}

function isFileAvailable(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Release status action failed";
}

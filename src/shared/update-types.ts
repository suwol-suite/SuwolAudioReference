export type UpdatePlatformSupport = "linux_appimage" | "unsupported_platform" | "unsupported_package" | "dev_mode";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not_available"
  | "downloading"
  | "downloaded"
  | "error"
  | "disabled";

export type UpdateErrorCode =
  | "UPDATE_UNSUPPORTED_PLATFORM"
  | "UPDATE_UNSUPPORTED_PACKAGE"
  | "UPDATE_CHECK_FAILED"
  | "UPDATE_DOWNLOAD_FAILED"
  | "UPDATE_INSTALL_FAILED"
  | "UPDATE_GITHUB_RELEASE_UNAVAILABLE"
  | "UPDATE_METADATA_MISSING";

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateState {
  supported: boolean;
  supportReason: UpdatePlatformSupport;
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  downloadedVersion?: string;
  errorCode?: UpdateErrorCode;
  errorMessage?: string;
  progress?: UpdateProgress;
}

export interface UpdateSettings {
  checkOnStartup: boolean;
  autoDownload: boolean;
  linuxAppImageOnly: true;
}

export type UpdateSettingsInput = Partial<Pick<UpdateSettings, "checkOnStartup" | "autoDownload">>;

export type ReleaseDistributionKind =
  | "development"
  | "windows_zip"
  | "linux_appimage"
  | "linux_tarball_or_zip"
  | "unsupported_platform";

export type ReleaseAutoUpdateReason =
  | "linux_appimage"
  | "windows_manual"
  | "linux_manual"
  | "development"
  | "unsupported_platform";

export type ReleaseStatusErrorCode =
  | "RELEASE_STATUS_LOAD_FAILED"
  | "RELEASE_PAGE_OPEN_FAILED"
  | "CHECKSUM_HELP_OPEN_FAILED";

export type ReleaseAssetKind =
  | "windows_zip"
  | "linux_zip"
  | "linux_appimage"
  | "linux_tarball"
  | "linux_update_metadata"
  | "linux_blockmap"
  | "zip_checksums"
  | "linux_checksums"
  | "signed_linux_checksums"
  | "public_key";

export interface ReleaseAssetExpectation {
  kind: ReleaseAssetKind;
  fileName: string;
  requiredFor: "manual_download" | "linux_auto_update" | "verification";
}

export interface ReleaseChecksumCommand {
  id: "windows_hash" | "linux_import_key" | "linux_verify_signature" | "linux_verify_checksums" | "linux_hash_appimage";
  platform: "windows" | "linux";
  command: string;
}

export interface ReleaseStatus {
  appName: string;
  currentVersion: string;
  platform: NodeJS.Platform;
  isPackaged: boolean;
  distributionKind: ReleaseDistributionKind;
  autoUpdateSupported: boolean;
  autoUpdateReason: ReleaseAutoUpdateReason;
  releasePageUrl: string;
  latestReleaseUrl: string;
  checksumHelpUrl: string;
  expectedAssets: ReleaseAssetExpectation[];
  checksumCommands: ReleaseChecksumCommand[];
  publicKey: {
    fileName: string;
    available: boolean;
  };
  lastErrorCode?: ReleaseStatusErrorCode;
  lastErrorMessage?: string;
}

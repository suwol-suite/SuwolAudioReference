import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RELEASE_PUBLIC_KEY_FILE_NAME,
  ReleaseStatusService,
  buildChecksumCommands,
  buildExpectedReleaseAssets,
  formatLinuxAppImageChecksumCommand,
  formatWindowsChecksumCommand,
  resolveReleaseDistribution,
} from "../release-status-service";

describe("release-status-service", () => {
  it("detects Windows manual update builds", () => {
    expect(resolveReleaseDistribution({ platform: "win32", isPackaged: true })).toEqual({
      distributionKind: "windows_zip",
      autoUpdateSupported: false,
      autoUpdateReason: "windows_manual",
    });
  });

  it("detects development mode before platform/package checks", () => {
    expect(resolveReleaseDistribution({ platform: "linux", isPackaged: false, appImagePath: "/tmp/app.AppImage" })).toEqual({
      distributionKind: "development",
      autoUpdateSupported: false,
      autoUpdateReason: "development",
    });
  });

  it("detects Linux AppImage builds as auto-update supported", () => {
    expect(resolveReleaseDistribution({ platform: "linux", isPackaged: true, appImagePath: "/tmp/app.AppImage" })).toEqual({
      distributionKind: "linux_appimage",
      autoUpdateSupported: true,
      autoUpdateReason: "linux_appimage",
    });
  });

  it("detects Linux non-AppImage packages as manual update builds", () => {
    expect(resolveReleaseDistribution({ platform: "linux", isPackaged: true })).toEqual({
      distributionKind: "linux_zip",
      autoUpdateSupported: false,
      autoUpdateReason: "linux_manual",
    });
  });

  it("includes current version in expected release asset names", () => {
    const assets = buildExpectedReleaseAssets("0.1.6", "Suwol Audio Reference");
    expect(assets.map((asset) => asset.fileName)).toEqual(
      expect.arrayContaining([
        "SuwolAudioReference-0.1.6-win-x64.zip",
        "SuwolAudioReference-0.1.6-linux-x64.zip",
        "SuwolAudioReference-0.1.6-linux-x64.AppImage",
        "SuwolAudioReference-0.1.6-mac-arm64.dmg",
        "SuwolAudioReference-0.1.6-mac-arm64.zip",
        "latest-linux.yml",
        "latest-mac.yml",
      ]),
    );
  });

  it("lists checksum and signature filenames", () => {
    const assets = buildExpectedReleaseAssets("0.1.6");
    expect(assets.map((asset) => asset.fileName)).toEqual(
      expect.arrayContaining([
        "checksums.txt",
        "checksums.txt.asc",
        "SuwolAudioReference-0.1.6-checksums.txt",
        "SuwolAudioReference-0.1.6-checksums.txt.asc",
        RELEASE_PUBLIC_KEY_FILE_NAME,
      ]),
    );
  });

  it("checks public key availability", async () => {
    const root = join(tmpdir(), `suwol-release-status-${crypto.randomUUID()}`);
    await mkdir(root, { recursive: true });
    const service = new ReleaseStatusService({
      platform: "win32",
      isPackaged: true,
      currentVersion: "0.1.6",
      projectRoot: root,
    });

    expect(service.getStatus().publicKey.available).toBe(false);
    await writeFile(join(root, RELEASE_PUBLIC_KEY_FILE_NAME), "public key", "utf8");
    expect(service.getStatus().publicKey.available).toBe(true);
  });

  it("formats checksum commands with release filenames", () => {
    expect(formatWindowsChecksumCommand("0.1.6")).toBe(
      'Get-FileHash ".\\SuwolAudioReference-0.1.6-win-x64.zip" -Algorithm SHA256',
    );
    expect(formatLinuxAppImageChecksumCommand("0.1.6")).toBe("sha256sum 'SuwolAudioReference-0.1.6-linux-x64.AppImage'");
    expect(buildChecksumCommands("0.1.6").map((command) => command.command)).toEqual(
      expect.arrayContaining([
        "gpg --import suwol-release-public-key.asc",
        "gpg --verify checksums.txt.asc checksums.txt",
        "shasum -a 256 -c checksums.txt",
      ]),
    );
  });
});

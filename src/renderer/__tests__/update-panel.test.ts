import { describe, expect, it } from "vitest";
import { getChecksumCommandLabelKey } from "../components/ChecksumHelpPanel";
import {
  getReleaseAssetLabelKey,
  getReleaseAutoUpdatePolicyKey,
  getReleaseDistributionLabelKey,
  getUpdateStatusKey,
  getUpdateSupportMessageKey,
} from "../components/UpdatePanel";

describe("UpdatePanel helpers", () => {
  it("maps unsupported environments to the expected user-facing messages", () => {
    expect(getUpdateSupportMessageKey("linux_appimage", true)).toBe("updates.supportedLinuxAppImage");
    expect(getUpdateSupportMessageKey("unsupported_platform", false)).toBe("updates.windowsManual");
    expect(getUpdateSupportMessageKey("unsupported_package", false)).toBe("updates.linuxZipManual");
    expect(getUpdateSupportMessageKey("dev_mode", false)).toBe("updates.devMode");
  });

  it("maps update states to localized status keys", () => {
    expect(getUpdateStatusKey("checking")).toBe("updates.status.checking");
    expect(getUpdateStatusKey("downloaded")).toBe("updates.status.downloaded");
  });

  it("maps release distribution and asset labels", () => {
    expect(getReleaseDistributionLabelKey("windows_zip")).toBe("updates.distribution.windows_zip");
    expect(getReleaseDistributionLabelKey("linux_appimage")).toBe("updates.distribution.linux_appimage");
    expect(getReleaseAssetLabelKey("signed_checksums")).toBe("updates.asset.signed_checksums");
  });

  it("maps release update policies", () => {
    expect(getReleaseAutoUpdatePolicyKey("linux_appimage", true)).toBe("updates.linuxAppImageAutoUpdate");
    expect(getReleaseAutoUpdatePolicyKey("windows_zip", false)).toBe("updates.windowsManualUpdate");
    expect(getReleaseAutoUpdatePolicyKey("linux_zip", false)).toBe("updates.linuxZipManualUpdate");
    expect(getReleaseAutoUpdatePolicyKey("development", false)).toBe("updates.developmentMode");
  });

  it("maps checksum command labels", () => {
    expect(getChecksumCommandLabelKey({ id: "linux_verify_signature", platform: "linux", command: "gpg" })).toBe(
      "updates.command.linux_verify_signature",
    );
  });
});

import { describe, expect, it } from "vitest";
import { getUpdateStatusKey, getUpdateSupportMessageKey } from "../components/UpdatePanel";

describe("UpdatePanel helpers", () => {
  it("maps unsupported environments to the expected user-facing messages", () => {
    expect(getUpdateSupportMessageKey("linux_appimage", true)).toBe("updates.supportedLinuxAppImage");
    expect(getUpdateSupportMessageKey("unsupported_platform", false)).toBe("updates.windowsManual");
    expect(getUpdateSupportMessageKey("unsupported_package", false)).toBe("updates.linuxTarManual");
    expect(getUpdateSupportMessageKey("dev_mode", false)).toBe("updates.devMode");
  });

  it("maps update states to localized status keys", () => {
    expect(getUpdateStatusKey("checking")).toBe("updates.status.checking");
    expect(getUpdateStatusKey("downloaded")).toBe("updates.status.downloaded");
  });
});

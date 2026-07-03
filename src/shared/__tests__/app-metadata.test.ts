import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_DESCRIPTION_EN,
  APP_DESCRIPTION_KO,
  APP_ID,
  APP_KNOWN_ISSUES_DOC,
  APP_LICENSE,
  APP_LINUX_DISTRIBUTION_DOC,
  APP_NAME,
  APP_RELEASE_NOTES_DOC,
  APP_VERSION,
  APP_WINDOWS_DISTRIBUTION_DOC,
} from "../app-metadata";

describe("app metadata", () => {
  it("keeps release branding constants stable", () => {
    expect(APP_NAME).toBe("Suwol Audio Reference");
    expect(APP_ID).toBe("work.suwol.audio-reference");
    expect(APP_VERSION).toBe("0.1.1");
    expect(APP_DESCRIPTION_KO).toBe("로컬 오디오 레퍼런스/에셋 관리 앱");
    expect(APP_DESCRIPTION_EN).toBe("Local audio reference and asset manager");
    expect(APP_LICENSE).toBe("Apache-2.0");
    expect(APP_RELEASE_NOTES_DOC).toBe("docs/release-notes-0.1.1.md");
    expect(APP_KNOWN_ISSUES_DOC).toBe("docs/known-issues.md");
    expect(APP_WINDOWS_DISTRIBUTION_DOC).toBe("docs/windows-distribution.md");
    expect(APP_LINUX_DISTRIBUTION_DOC).toBe("docs/linux-distribution.md");
  });

  it("keeps displayed version and license aligned with package metadata", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
      license: string;
      build: { appId: string; productName: string };
    };

    expect(APP_VERSION).toBe(packageJson.version);
    expect(APP_LICENSE).toBe(packageJson.license);
    expect(APP_ID).toBe(packageJson.build.appId);
    expect(APP_NAME).toBe(packageJson.build.productName);
  });
});

import { describe, expect, it } from "vitest";
import mainEn from "../../main/i18n/locales/en.json";
import mainKo from "../../main/i18n/locales/ko.json";
import rendererEn from "../../renderer/i18n/locales/en.json";
import rendererKo from "../../renderer/i18n/locales/ko.json";
import { SUPPORTED_LOCALES } from "../i18n/locales";

describe("i18n locale parity", () => {
  it("keeps renderer ko/en keys aligned", () => {
    expect(Object.keys(rendererEn).sort()).toEqual(Object.keys(rendererKo).sort());
  });

  it("keeps main ko/en keys aligned", () => {
    expect(Object.keys(mainEn).sort()).toEqual(Object.keys(mainKo).sort());
  });

  it("keeps supported locales registry explicit", () => {
    expect(SUPPORTED_LOCALES).toEqual(["ko", "en"]);
  });

  it("includes Phase 6 diagnostics and crash fallback labels", () => {
    expect(rendererEn["diagnostics.openLogFolder"]).toContain("Log");
    expect(rendererKo["diagnostics.openLogFolder"]).toContain("로그");
    expect(rendererEn["errorBoundary.title"]).toContain("rendered");
    expect(rendererKo["errorBoundary.title"]).toContain("렌더링");
  });

  it("includes Phase 7 about and release document labels", () => {
    expect(rendererEn["app.version"]).toBe("Version");
    expect(rendererKo["app.version"]).toBe("버전");
    expect(rendererEn["app.releaseNotes"]).toContain("Release");
    expect(rendererKo["app.releaseNotes"]).toContain("릴리즈");
    expect(rendererEn["app.windowsDistribution"]).toContain("Windows");
    expect(rendererKo["app.windowsDistribution"]).toContain("Windows");
    expect(rendererEn["app.linuxDistribution"]).toContain("Linux");
    expect(rendererKo["app.linuxDistribution"]).toContain("Linux");
  });
});

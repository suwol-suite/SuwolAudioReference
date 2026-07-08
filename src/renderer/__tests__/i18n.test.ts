import { describe, expect, it } from "vitest";
import type { SuggestedAudioTag } from "../../shared/audio-analysis-types";
import { resolveLocale } from "../../shared/i18n/locales";
import { getSuggestedTagLabelByKey } from "../../shared/i18n/suggested-tag-labels";
import { formatClassificationLabel, formatReason, getSuggestedTagLabel } from "../i18n/analysis-labels";
import { createFormatters } from "../i18n/formatters";
import { lookup, translate, translateError } from "../i18n/i18n";

describe("i18n", () => {
  it("defaults to ko and resolves supported OS locales", () => {
    expect(resolveLocale(null, "fr-FR")).toBe("ko");
    expect(resolveLocale(null, "en-US")).toBe("en");
    expect(resolveLocale("ko", "en-US")).toBe("ko");
  });

  it("translates strings and falls back to the key when missing", () => {
    expect(translate("ko", "library.create")).toBe("새 라이브러리 만들기");
    expect(translate("en", "library.create")).toBe("New Library");
    expect(lookup("en", "missing.key")).toBe("missing.key");
  });

  it("localizes error codes", () => {
    expect(translateError("ko", "PLAYBACK_UNSUPPORTED")).toContain("재생");
    expect(translateError("en", "PLAYBACK_UNSUPPORTED")).toContain("cannot be played");
  });

  it("localizes classification labels and analysis reasons", () => {
    const enT = (key: Parameters<typeof translate>[1]) => translate("en", key);
    const koT = (key: Parameters<typeof translate>[1]) => translate("ko", key);

    expect(formatClassificationLabel("ui_sound", enT)).toBe("UI Sound");
    expect(formatClassificationLabel("ui_sound", koT)).toBe("UI 사운드");
    expect(formatReason("loop_score_high", enT)).toContain("connect smoothly");
    expect(formatReason("filename_click_keyword", koT)).toBe("파일명 또는 폴더명 키워드");
  });

  it("formats duration, file size, sample rate, bitrate, and channels", () => {
    const ko = createFormatters("ko");
    const en = createFormatters("en");

    expect(ko.duration(3000)).toBe("0:03");
    expect(en.duration(3_724_000)).toBe("1:02:04");
    expect(en.fileSize(1_500_000)).toContain("MB");
    expect(ko.sampleRate(44100)).toBe("44.1 kHz");
    expect(en.bitrate(320000)).toBe("320 kbps");
    expect(ko.channel(1)).toBe("모노");
    expect(en.channel(2)).toBe("Stereo");
  });

  it("localizes suggested tag keys while preserving unknown/user labels", () => {
    const tag: SuggestedAudioTag = {
      tag: "사용자태그",
      confidence: 1,
      source: "analysis",
      reasons: [],
    };
    const enT = (key: Parameters<typeof translate>[1]) => translate("en", key);

    expect(getSuggestedTagLabelByKey("tag.uiSound", "en")).toBe("UI Sound");
    expect(getSuggestedTagLabel(tag, enT)).toBe("사용자태그");
  });
  it("contains Phase 2 exploration labels in both locales", () => {
    expect(translate("en", "quickPreview.title")).toBe("Quick Preview");
    expect(translate("ko", "quickPreview.title")).toBe("빠른 미리듣기");
    expect(translate("en", "compare.title")).toBe("A/B Compare");
    expect(translate("ko", "smartFolder.recentPlayed")).toBe("최근 재생한 파일");
    expect(translate("en", "playbackReason.HTML_AUDIO_ERROR")).toContain("failed");
  });

  it("contains Phase 4 export and rights labels in both locales", () => {
    expect(translate("en", "export.title")).toBe("Export Center");
    expect(translate("ko", "export.target.generic_manifest")).toContain("manifest");
    expect(translate("en", "rights.title")).toBe("Source / License");
    expect(translate("ko", "rights.creditRequired")).toContain("크레딧");
    expect(translateError("en", "EXPORT_WRITE_FAILED")).toContain("write");
    expect(translateError("ko", "RIGHTS_UPDATE_FAILED")).toContain("권리");
  });

  it("contains Phase 5A polish labels in both locales", () => {
    expect(translate("en", "settings.tab.library")).toBe("Library");
    expect(translate("ko", "settings.tab.shortcuts")).toBe("단축키");
    expect(translate("en", "asset.loadMore")).toBe("Load More");
    expect(translate("ko", "inspector.saveChanges")).toContain("저장");
    expect(translate("en", "export.openOutput")).toContain("Open");
    expect(translate("ko", "management.confirmBulkRelink")).toContain("relink");
  });

  it("contains Phase 5B similarity labels in both locales", () => {
    expect(translate("en", "similarity.title")).toBe("Similar Sounds");
    expect(translate("ko", "similarity.title")).toBe("유사 사운드 후보");
    expect(translate("en", "similarity.reason.duplicate_content_hash")).toContain("hash");
    expect(translate("ko", "loop.reason.high_click_risk")).toContain("클릭");
    expect(translate("en", "smartFolder.needsReanalysis")).toContain("Reanalysis");
    expect(translateError("en", "SIMILARITY_SEARCH_FAILED")).toContain("Similarity");
    expect(translateError("ko", "FEATURE_RERUN_FAILED")).toContain("Feature");
  });

  it("contains Linux AppImage update labels in both locales", () => {
    expect(translate("en", "updates.check")).toBe("Check for Updates");
    expect(translate("ko", "updates.check")).toContain("업데이트");
    expect(translate("en", "updates.windowsManual")).toContain("manual");
    expect(translate("ko", "updates.linuxZipManual")).toContain("AppImage");
    expect(translate("en", "updates.releaseStatus")).toBe("Release Status");
    expect(translate("ko", "updates.releaseStatus")).toContain("릴리즈");
    expect(translate("en", "updates.linuxAppImageAutoUpdate")).toContain("AppImage");
    expect(translate("ko", "updates.windowsManualUpdate")).toContain("Windows");
    expect(translate("en", "updates.command.linux_verify_signature")).toContain("signature");
    expect(translate("ko", "updates.command.linux_verify_checksums")).toContain("Checksums");
    expect(translateError("en", "UPDATE_CHECK_FAILED")).toContain("Update");
    expect(translateError("ko", "UPDATE_DOWNLOAD_FAILED")).toContain("업데이트");
    expect(translateError("en", "RELEASE_STATUS_LOAD_FAILED")).toContain("Release");
    expect(translateError("ko", "CHECKSUM_HELP_OPEN_FAILED")).toContain("Checksum");
  });
});

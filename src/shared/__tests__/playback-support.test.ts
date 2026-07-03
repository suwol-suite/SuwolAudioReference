import { describe, expect, it } from "vitest";
import { isManageableAsset, isPlayableAudio, playbackSupportReason } from "../playback-support";

describe("playback-support", () => {
  it("separates manageable assets from playable browser audio", () => {
    expect(isManageableAsset("zip")).toBe(true);
    expect(isPlayableAudio("zip")).toBe(false);
    expect(isPlayableAudio("wav")).toBe(true);
  });

  it("returns playback support reasons", () => {
    expect(playbackSupportReason({ fileExt: "mid", playbackSupported: null, playbackErrorCode: null })).toBe(
      "UNSUPPORTED_EXTENSION",
    );
    expect(playbackSupportReason({ fileExt: "wav", playbackSupported: false, playbackErrorCode: "HTML_AUDIO_ERROR" })).toBe(
      "HTML_AUDIO_ERROR",
    );
    expect(playbackSupportReason({ fileExt: "mp3", playbackSupported: null, playbackErrorCode: null })).toBeNull();
  });
});

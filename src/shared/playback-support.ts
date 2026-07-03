import type { AssetRecord, PlaybackErrorCode } from "./library-types";

export const MANAGEABLE_ASSET_EXTENSIONS = new Set([
  "wav",
  "mp3",
  "ogg",
  "oga",
  "flac",
  "m4a",
  "aac",
  "opus",
  "mid",
  "midi",
  "json",
  "zip",
]);

export const PLAYABLE_AUDIO_EXTENSIONS = new Set(["wav", "mp3", "ogg", "oga", "flac", "m4a", "aac", "opus"]);

export function isManageableAsset(fileExt: string): boolean {
  return MANAGEABLE_ASSET_EXTENSIONS.has(normalizeExt(fileExt));
}

export function isPlayableAudio(fileExt: string, playbackSupported?: boolean | null): boolean {
  return playbackSupported !== false && PLAYABLE_AUDIO_EXTENSIONS.has(normalizeExt(fileExt));
}

export function playbackSupportReason(asset: Pick<AssetRecord, "fileExt" | "playbackSupported" | "playbackErrorCode">): PlaybackErrorCode | null {
  if (!PLAYABLE_AUDIO_EXTENSIONS.has(normalizeExt(asset.fileExt))) {
    return "UNSUPPORTED_EXTENSION";
  }
  if (asset.playbackSupported === false) {
    return asset.playbackErrorCode ?? "CODEC_UNSUPPORTED";
  }
  return null;
}

function normalizeExt(fileExt: string): string {
  return fileExt.replace(/^\./, "").toLowerCase();
}

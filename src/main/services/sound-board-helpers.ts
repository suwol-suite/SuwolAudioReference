import type {
  GameEngineType,
  ProjectDefaultExportFormat,
  SoundBoardExportFormat,
  SoundUsageCategory,
  SoundUsagePriority,
  SoundUsageStatus,
} from "../../shared/sound-board-types";

export const GAME_ENGINE_TYPES: GameEngineType[] = ["generic", "unity", "unreal", "monogame"];
export const PROJECT_EXPORT_FORMATS: ProjectDefaultExportFormat[] = [
  "generic_manifest",
  "unity_manifest",
  "unreal_manifest",
  "monogame_manifest",
  "codex_instruction",
  "sound_pack",
];
export const SOUND_BOARD_EXPORT_FORMATS: SoundBoardExportFormat[] = [...PROJECT_EXPORT_FORMATS, "missing_report"];
export const SOUND_USAGE_CATEGORIES: SoundUsageCategory[] = ["ui", "sfx", "bgm", "ambience", "voice", "music", "other"];
export const SOUND_USAGE_STATUSES: SoundUsageStatus[] = [
  "missing",
  "needs_candidates",
  "reviewing",
  "selected",
  "approved",
  "rejected",
  "deferred",
];
export const SOUND_USAGE_PRIORITIES: SoundUsagePriority[] = ["low", "normal", "high", "critical"];

export function sanitizeUsageKey(input: string, fallback = "sound"): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 96);
  const key = normalized || fallback;
  return /^[0-9]/.test(key) ? `sound.${key}` : key;
}

export function isValidUsageKey(input: string): boolean {
  return /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input);
}

export function coerceGameEngine(value: unknown): GameEngineType {
  return GAME_ENGINE_TYPES.includes(value as GameEngineType) ? (value as GameEngineType) : "generic";
}

export function coerceProjectExportFormat(value: unknown): ProjectDefaultExportFormat {
  return PROJECT_EXPORT_FORMATS.includes(value as ProjectDefaultExportFormat)
    ? (value as ProjectDefaultExportFormat)
    : "generic_manifest";
}

export function coerceSoundBoardExportFormat(value: unknown): SoundBoardExportFormat {
  return SOUND_BOARD_EXPORT_FORMATS.includes(value as SoundBoardExportFormat)
    ? (value as SoundBoardExportFormat)
    : "generic_manifest";
}

export function coerceUsageCategory(value: unknown): SoundUsageCategory {
  return SOUND_USAGE_CATEGORIES.includes(value as SoundUsageCategory) ? (value as SoundUsageCategory) : "sfx";
}

export function coerceUsageStatus(value: unknown): SoundUsageStatus {
  return SOUND_USAGE_STATUSES.includes(value as SoundUsageStatus) ? (value as SoundUsageStatus) : "missing";
}

export function coerceUsagePriority(value: unknown): SoundUsagePriority {
  return SOUND_USAGE_PRIORITIES.includes(value as SoundUsagePriority) ? (value as SoundUsagePriority) : "normal";
}

export function normalizeOptionalText(value: string | undefined | null): string {
  return value?.trim() ?? "";
}

export function boolToInt(value: boolean | undefined | null): number {
  return value ? 1 : 0;
}

export function intToBool(value: number | undefined | null): boolean {
  return value === 1;
}

export function normalizeTargetDuration(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

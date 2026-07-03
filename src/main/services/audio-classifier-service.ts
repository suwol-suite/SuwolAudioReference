import {
  ANALYZER_VERSION,
  type AudioAnalysisInput,
  type AudioAnalysisMetrics,
  type AudioAnalysisResult,
  type AudioClassificationCandidate,
  type AudioClassificationType,
  type SuggestedAudioTag,
  type SuggestedTagSource,
} from "../../shared/audio-analysis-types";
import { estimateLoopLikelihood } from "./audio-analysis-service";
import { clamp01 } from "./waveform-service";

interface ScoreEntry {
  score: number;
  reasons: Set<string>;
}

interface TagEntry {
  tag: string;
  tagKey?: string;
  confidence: number;
  source: SuggestedTagSource;
  reasons: Set<string>;
}

const CLASSIFICATION_THRESHOLD = 0.18;

const CLASSIFICATION_TYPES: AudioClassificationType[] = [
  "music",
  "sfx",
  "ui_sound",
  "voice",
  "ambience",
  "loop_candidate",
  "retro_8bit_candidate",
  "retro_16bit_candidate",
];

export function createAudioAnalysisResult(input: AudioAnalysisInput, warnings: string[] = []): AudioAnalysisResult {
  const { classification, suggestedTags } = classifyAudio(input);
  const loopLikelihood = estimateLoopLikelihood(input.metrics?.loopScore);

  return {
    ...input.metrics,
    durationMs: input.metrics?.durationMs ?? input.metadata.durationMs,
    sampleRate: input.metrics?.sampleRate ?? input.metadata.sampleRate,
    channels: input.metrics?.channels ?? input.metadata.channels,
    bitrate: input.metrics?.bitrate ?? input.metadata.bitrate,
    codec: input.metrics?.codec ?? input.metadata.codec,
    format: input.metrics?.format ?? input.metadata.format ?? input.metadata.extension,
    classification,
    suggestedTags,
    loopLikelihood,
    analyzerVersion: ANALYZER_VERSION,
    warnings,
  };
}

export function classifyAudio(input: AudioAnalysisInput): {
  classification: AudioClassificationCandidate[];
  suggestedTags: SuggestedAudioTag[];
} {
  const scores = createScores();
  const tags = new Map<string, TagEntry>();
  const metrics = input.metrics ?? {};
  const metadata = input.metadata;
  const durationMs = metrics.durationMs ?? metadata.durationMs;
  const durationSeconds = durationMs !== undefined ? durationMs / 1000 : undefined;
  const fileText = normalizeText(metadata.fileName);
  const folderText = normalizeText(metadata.folderName);
  const combinedText = `${fileText} ${folderText}`;

  applyKeywordRules(scores, tags, fileText, "filename");
  applyKeywordRules(scores, tags, folderText, "folder");
  applyDurationRules(scores, tags, durationMs);
  applyDspRules(scores, tags, metrics, durationSeconds, combinedText);

  const classification = CLASSIFICATION_TYPES.map((type) => ({
    type,
    confidence: confidenceFromScore(scores.get(type)?.score ?? 0),
    reasons: Array.from(scores.get(type)?.reasons ?? []),
  }))
    .filter((candidate) => candidate.confidence >= CLASSIFICATION_THRESHOLD)
    .sort((left, right) => right.confidence - left.confidence);

  if (classification.length === 0) {
    classification.push({
      type: "unknown",
      confidence: 0.5,
      reasons: ["insufficient_evidence"],
    });
  }

  for (const candidate of classification) {
    if (candidate.type === "music") {
      upsertTag(tags, "BGM", candidate.confidence * 0.9, "analysis", "classification_music", "tag.bgm");
    }
    if (candidate.type === "sfx") {
      upsertTag(tags, "효과음", candidate.confidence * 0.9, "analysis", "classification_sfx", "tag.sfx");
    }
    if (candidate.type === "ui_sound") {
      upsertTag(tags, "UI사운드", candidate.confidence * 0.9, "analysis", "classification_ui_sound", "tag.uiSound");
    }
    if (candidate.type === "voice") {
      upsertTag(tags, "보이스", candidate.confidence * 0.9, "analysis", "classification_voice", "tag.voice");
    }
    if (candidate.type === "ambience") {
      upsertTag(tags, "앰비언스", candidate.confidence * 0.9, "analysis", "classification_ambience", "tag.ambience");
    }
    if (candidate.type === "loop_candidate") {
      upsertTag(tags, "루프가능", candidate.confidence * 0.9, "analysis", "classification_loop_candidate", "tag.loopable");
    }
    if (candidate.type === "retro_8bit_candidate") {
      upsertTag(tags, "8비트", candidate.confidence * 0.9, "analysis", "classification_retro_8bit", "tag.retro8bit");
      upsertTag(tags, "레트로", candidate.confidence * 0.75, "analysis", "classification_retro_8bit", "tag.retro");
    }
    if (candidate.type === "retro_16bit_candidate") {
      upsertTag(tags, "16비트", candidate.confidence * 0.9, "analysis", "classification_retro_16bit", "tag.retro16bit");
      upsertTag(tags, "레트로", candidate.confidence * 0.7, "analysis", "classification_retro_16bit", "tag.retro");
    }
  }

  return {
    classification,
    suggestedTags: Array.from(tags.values())
      .map((tag) => ({
        tag: tag.tag,
        tagKey: tag.tagKey,
        confidence: roundConfidence(tag.confidence),
        source: tag.source,
        reasons: Array.from(tag.reasons),
      }))
      .filter((tag) => tag.confidence >= 0.18)
      .sort((left, right) => right.confidence - left.confidence || left.tag.localeCompare(right.tag)),
  };
}

function createScores(): Map<AudioClassificationType, ScoreEntry> {
  const scores = new Map<AudioClassificationType, ScoreEntry>();
  for (const type of CLASSIFICATION_TYPES) {
    scores.set(type, { score: 0, reasons: new Set<string>() });
  }
  return scores;
}

function applyKeywordRules(
  scores: Map<AudioClassificationType, ScoreEntry>,
  tags: Map<string, TagEntry>,
  text: string,
  source: SuggestedTagSource,
): void {
  if (hasAny(text, ["bgm", "music", "theme", "battle_theme", "battle-theme", "stage", "loop"])) {
    addScore(scores, "music", 0.42, `${source}_music_keyword`);
    upsertTag(tags, "BGM", 0.78, source, `${source}_music_keyword`, "tag.bgm");
  }

  if (hasAny(text, ["loop"])) {
    addScore(scores, "loop_candidate", 0.5, `${source}_loop_keyword`);
    upsertTag(tags, "루프가능", 0.82, source, `${source}_loop_keyword`, "tag.loopable");
  }

  if (hasAny(text, ["click", "button", "ui", "select", "confirm", "cancel", "beep"])) {
    addScore(scores, "ui_sound", 0.55, `${source}_ui_keyword`);
    upsertTag(tags, "UI사운드", 0.84, source, `${source}_ui_keyword`, "tag.uiSound");
  }

  if (hasAny(text, ["click"])) {
    upsertTag(tags, "클릭", 0.82, source, `${source}_click_keyword`, "tag.click");
  }

  if (hasAny(text, ["button"])) {
    upsertTag(tags, "버튼", 0.82, source, `${source}_button_keyword`, "tag.button");
  }

  if (hasAny(text, ["alert", "notify", "notification", "success", "fail", "reward"])) {
    addScore(scores, "ui_sound", 0.32, `${source}_notification_keyword`);
    addScore(scores, "sfx", 0.22, `${source}_notification_keyword`);
    upsertTag(tags, "알림", 0.75, source, `${source}_notification_keyword`, "tag.alert");
  }

  if (hasAny(text, ["hit", "attack", "slash", "impact", "explosion", "footstep", "door"])) {
    addScore(scores, "sfx", 0.5, `${source}_sfx_keyword`);
    upsertTag(tags, "효과음", 0.8, source, `${source}_sfx_keyword`, "tag.sfx");
  }

  if (hasAny(text, ["voice", "vocal", "dialog", "dialogue", "npc", "male", "female"])) {
    addScore(scores, "voice", 0.55, `${source}_voice_keyword`);
    upsertTag(tags, "보이스", 0.83, source, `${source}_voice_keyword`, "tag.voice");
  }

  if (hasAny(text, ["ambience", "ambient", "cave", "wind", "rain", "fire", "forest"])) {
    addScore(scores, "ambience", 0.55, `${source}_ambience_keyword`);
    upsertTag(tags, "앰비언스", 0.83, source, `${source}_ambience_keyword`, "tag.ambience");
  }

  if (hasAny(text, ["8bit", "8-bit", "chiptune", "chip", "nes"])) {
    addScore(scores, "retro_8bit_candidate", 0.56, `${source}_8bit_keyword`);
    upsertTag(tags, "8비트", 0.86, source, `${source}_8bit_keyword`, "tag.retro8bit");
    upsertTag(tags, "레트로", 0.72, source, `${source}_8bit_keyword`, "tag.retro");
  }

  if (hasAny(text, ["16bit", "16-bit", "snes", "sega"])) {
    addScore(scores, "retro_16bit_candidate", 0.48, `${source}_16bit_keyword`);
    upsertTag(tags, "16비트", 0.78, source, `${source}_16bit_keyword`, "tag.retro16bit");
    upsertTag(tags, "레트로", 0.67, source, `${source}_16bit_keyword`, "tag.retro");
  }

  if (hasAny(text, ["retro"])) {
    addScore(scores, "retro_8bit_candidate", 0.18, `${source}_retro_keyword`);
    addScore(scores, "retro_16bit_candidate", 0.2, `${source}_retro_keyword`);
    upsertTag(tags, "레트로", 0.58, source, `${source}_retro_keyword`, "tag.retro");
  }
}

function applyDurationRules(
  scores: Map<AudioClassificationType, ScoreEntry>,
  tags: Map<string, TagEntry>,
  durationMs?: number,
): void {
  if (durationMs === undefined || durationMs <= 0) {
    return;
  }

  if (durationMs <= 1000) {
    addScore(scores, "ui_sound", 0.36, "duration_under_1s");
    addScore(scores, "sfx", 0.25, "duration_under_1s");
    upsertTag(tags, "짧음", 0.95, "duration", "duration_under_1s", "tag.short");
    return;
  }

  if (durationMs <= 5000) {
    addScore(scores, "sfx", 0.38, "duration_under_5s");
    upsertTag(tags, "효과음", 0.72, "duration", "duration_under_5s", "tag.sfx");
    return;
  }

  if (durationMs <= 15000) {
    addScore(scores, "sfx", 0.22, "duration_under_15s");
    addScore(scores, "voice", 0.18, "duration_voice_range");
    upsertTag(tags, "효과음", 0.55, "duration", "duration_under_15s", "tag.sfx");
    return;
  }

  if (durationMs <= 30000) {
    addScore(scores, "music", 0.22, "duration_15s_to_30s");
    addScore(scores, "ambience", 0.18, "duration_15s_to_30s");
    addScore(scores, "loop_candidate", 0.16, "duration_15s_to_30s");
    upsertTag(tags, "BGM", 0.5, "duration", "duration_15s_to_30s", "tag.bgm");
    return;
  }

  addScore(scores, "music", 0.34, "duration_over_30s");
  addScore(scores, "ambience", 0.26, "duration_over_30s");
  upsertTag(tags, "BGM", 0.68, "duration", "duration_over_30s", "tag.bgm");
  upsertTag(tags, "긴음", 0.9, "duration", "duration_over_30s", "tag.long");
}

function applyDspRules(
  scores: Map<AudioClassificationType, ScoreEntry>,
  tags: Map<string, TagEntry>,
  metrics: AudioAnalysisMetrics,
  durationSeconds: number | undefined,
  combinedText: string,
): void {
  const transientDensity =
    durationSeconds && durationSeconds > 0 && metrics.transientCount !== undefined
      ? metrics.transientCount / durationSeconds
      : undefined;
  const peakMinusRms =
    metrics.peakDb !== undefined && metrics.rmsDb !== undefined ? metrics.peakDb - metrics.rmsDb : undefined;

  if (durationSeconds !== undefined && durationSeconds >= 15 && (metrics.rmsVariation ?? 1) <= 0.42) {
    addScore(scores, "music", 0.2, "stable_long_rms");
  }

  if ((metrics.channels ?? 0) >= 2 && durationSeconds !== undefined && durationSeconds >= 8) {
    addScore(scores, "music", 0.1, "stereo_long_audio");
  }

  if (durationSeconds !== undefined && durationSeconds <= 5 && peakMinusRms !== undefined && peakMinusRms >= 12) {
    addScore(scores, "sfx", 0.28, "peak_rms_gap");
  }

  if (durationSeconds !== undefined && durationSeconds <= 1.2 && (metrics.transientCount ?? 0) >= 1) {
    addScore(scores, "ui_sound", 0.22, "short_strong_transient");
    addScore(scores, "sfx", 0.12, "short_strong_transient");
  }

  if (
    durationSeconds !== undefined &&
    durationSeconds >= 0.05 &&
    durationSeconds <= 1 &&
    (metrics.silenceStartMs ?? 0) < 80 &&
    (metrics.silenceEndMs ?? 0) < 120 &&
    (metrics.spectralCentroid ?? 0) >= 1600
  ) {
    addScore(scores, "ui_sound", 0.26, "short_bright_no_silence");
  }

  if (
    durationSeconds !== undefined &&
    durationSeconds >= 1 &&
    durationSeconds <= 30 &&
    (metrics.channels ?? 2) <= 1 &&
    (metrics.spectralCentroid ?? 0) >= 250 &&
    (metrics.spectralCentroid ?? 0) <= 4200
  ) {
    addScore(scores, "voice", 0.2, "mono_voice_band");
  }

  if (
    durationSeconds !== undefined &&
    durationSeconds >= 15 &&
    (metrics.rmsVariation ?? 1) <= 0.35 &&
    (transientDensity ?? 99) <= 0.7
  ) {
    addScore(scores, "ambience", 0.24, "stable_low_transient_long_audio");
  }

  if (durationSeconds !== undefined && durationSeconds >= 15 && (metrics.spectralFlatness ?? 0) >= 0.35) {
    addScore(scores, "ambience", 0.16, "broad_noise_spectrum");
  }

  if ((metrics.loopScore ?? 0) >= 0.72) {
    addScore(scores, "loop_candidate", 0.62, "loop_score_high");
    upsertTag(tags, "루프가능", 0.86, "analysis", "loop_score_high", "tag.loopable");
  } else if ((metrics.loopScore ?? 0) >= 0.42) {
    addScore(scores, "loop_candidate", 0.34, "loop_score_medium");
    upsertTag(tags, "루프가능", 0.55, "analysis", "loop_score_medium", "tag.loopable");
  }

  if (
    durationSeconds !== undefined &&
    durationSeconds <= 3 &&
    (metrics.zeroCrossingRate ?? 0) >= 0.08 &&
    (metrics.spectralFlatness ?? 1) <= 0.35
  ) {
    addScore(scores, "retro_8bit_candidate", 0.16, "simple_bright_waveform");
  }

  if (hasAny(combinedText, ["8bit", "8-bit", "chiptune", "chip", "nes"]) && durationSeconds !== undefined) {
    addScore(scores, durationSeconds <= 2 ? "ui_sound" : "sfx", 0.08, "retro_short_sound_hint");
  }
}

function addScore(
  scores: Map<AudioClassificationType, ScoreEntry>,
  type: AudioClassificationType,
  amount: number,
  reason: string,
): void {
  const entry = scores.get(type);
  if (!entry) {
    return;
  }

  entry.score += amount;
  entry.reasons.add(reason);
}

function upsertTag(
  tags: Map<string, TagEntry>,
  tag: string,
  confidence: number,
  source: SuggestedTagSource,
  reason: string,
  tagKey?: string,
): void {
  const key = normalizeTagName(tag);
  const existing = tags.get(key);

  if (!existing) {
    tags.set(key, {
      tag,
      tagKey,
      confidence: clamp01(confidence),
      source,
      reasons: new Set([reason]),
    });
    return;
  }

  existing.confidence = Math.max(existing.confidence, clamp01(confidence));
  existing.tagKey ??= tagKey;
  existing.reasons.add(reason);
  if (source === "filename" || (source === "folder" && existing.source !== "filename")) {
    existing.source = source;
  }
}

function confidenceFromScore(score: number): number {
  return roundConfidence(clamp01(1 - Math.exp(-Math.max(0, score) * 1.35)));
}

function roundConfidence(value: number): number {
  return Math.round(clamp01(value) * 100) / 100;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTagName(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase().replace(/[_\-.]+/g, " ")));
}

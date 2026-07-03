import { basename } from "node:path";
import { APP_NAME } from "../../shared/app-metadata";
import type { LibraryRecord } from "../../shared/library-types";
import type { CodexInstructionTemplate, ExportAssetContext, ExportSource } from "../../shared/export-types";

export interface CodexInstructionOptions {
  goal: string;
  template: CodexInstructionTemplate;
  includeAbsolutePaths: boolean;
  includeRights: boolean;
}

export class CodexInstructionExportService {
  createMarkdown(
    library: LibraryRecord,
    source: ExportSource,
    sourceLabel: string,
    contexts: ExportAssetContext[],
    options: CodexInstructionOptions,
  ): string {
    const lines = [
      "# Suwol Audio Reference Export",
      "",
      "## Goal",
      "",
      options.goal.trim() || "TODO: Describe the game-audio task for Codex.",
      "",
      "## Source",
      "",
      `* Library name: ${escapeMarkdown(library.name)}`,
      `* Exported at: ${new Date().toISOString()}`,
      `* Asset count: ${contexts.length}`,
      `* Export source: ${escapeMarkdown(describeSource(source, sourceLabel))}`,
      "",
      "## Rules",
      "",
      "* Do not modify the original audio files.",
      "* If file names need to change, propose a rename plan only.",
      "* Do not infer license or source metadata. Mark missing values as TODO.",
      "* Create an import plan that fits the selected game engine or workflow.",
      "* Use relative paths unless absolute paths were explicitly included.",
      "* Treat local paths as private project context.",
      "",
      "## Assets",
      "",
      ...contexts.flatMap((context, index) => this.createAssetMarkdown(context, index + 1, options)),
      "## Requested Output",
      "",
      requestedOutputForTemplate(options.template),
      "",
    ];
    return `${lines.join("\n")}\n`;
  }

  createJsonContext(
    library: LibraryRecord,
    source: ExportSource,
    sourceLabel: string,
    contexts: ExportAssetContext[],
    options: CodexInstructionOptions,
  ): Record<string, unknown> {
    return {
      app: APP_NAME,
      contextVersion: 1,
      createdAt: new Date().toISOString(),
      goal: options.goal,
      template: options.template,
      source: {
        libraryName: library.name,
        exportSource: describeSource(source, sourceLabel),
        assetCount: contexts.length,
      },
      rules: [
        "Do not modify original audio files.",
        "Propose rename plans instead of renaming source files.",
        "Do not infer license or source metadata.",
        "Mark missing metadata as TODO.",
        "Use relative paths unless absolute paths are included.",
      ],
      assets: contexts.map((context) => this.createAssetJson(context, options)),
      requestedOutput: requestedOutputForTemplate(options.template),
    };
  }

  private createAssetMarkdown(
    context: ExportAssetContext,
    index: number,
    options: CodexInstructionOptions,
  ): string[] {
    const asset = context.asset;
    const rights = context.rights;
    return [
      `### ${index}. ${escapeMarkdown(asset.title || asset.fileName)}`,
      "",
      `* id: ${asset.id}`,
      `* fileName: ${escapeMarkdown(asset.fileName)}`,
      `* relativePath: ${escapeMarkdown(context.relativePath)}`,
      ...(options.includeAbsolutePaths ? [`* originalPath: ${escapeMarkdown(asset.originalPath)}`] : []),
      `* duration: ${formatMs(asset.audioAnalysis?.durationMs)}`,
      `* format: ${asset.audioAnalysis?.format ?? asset.fileExt}`,
      `* sampleRate: ${asset.audioAnalysis?.sampleRate ?? "unknown"}`,
      `* channels: ${asset.audioAnalysis?.channels ?? "unknown"}`,
      `* bitrate: ${asset.audioAnalysis?.bitrate ?? "unknown"}`,
      `* tags: ${asset.tags.map((tag) => tag.name).join(", ") || "none"}`,
      `* collections: ${asset.collections.map((collection) => collection.name).join(", ") || "none"}`,
      `* rating: ${asset.rating}`,
      `* favorite: ${asset.favorite ? "yes" : "no"}`,
      `* memo: ${asset.memo || "none"}`,
      `* classification candidates: ${
        asset.audioAnalysis?.classification.map((candidate) => `${candidate.type}:${candidate.confidence.toFixed(2)}`).join(", ") ??
        "unknown"
      }`,
      `* loop score: ${asset.audioAnalysis?.loopScore ?? "unknown"}`,
      `* peak/RMS: ${asset.audioAnalysis?.peakDb ?? "unknown"} / ${asset.audioAnalysis?.rmsDb ?? "unknown"}`,
      `* playback support: ${asset.playable ? "playable" : asset.playbackSupportReason ?? "unsupported"}`,
      `* engineKey: ${context.engineKey}`,
      `* usageHint: ${context.usageHint}`,
      ...(options.includeRights
        ? [
            `* source/license: ${rights.licenseName || "TODO"} / ${rights.sourceName || "TODO"}`,
            `* author: ${rights.author || "TODO"}`,
            `* attribution: ${rights.attributionText || "TODO"}`,
            `* usage notes: ${rights.usageNotes || "TODO"}`,
          ]
        : []),
      "",
    ];
  }

  private createAssetJson(context: ExportAssetContext, options: CodexInstructionOptions): Record<string, unknown> {
    const asset = context.asset;
    return {
      id: asset.id,
      fileName: asset.fileName,
      relativePath: context.relativePath,
      originalPath: options.includeAbsolutePaths ? asset.originalPath : undefined,
      title: asset.title,
      durationMs: asset.audioAnalysis?.durationMs ?? null,
      format: asset.audioAnalysis?.format ?? asset.fileExt,
      sampleRate: asset.audioAnalysis?.sampleRate ?? null,
      channels: asset.audioAnalysis?.channels ?? null,
      bitrate: asset.audioAnalysis?.bitrate ?? null,
      tags: asset.tags.map((tag) => tag.name),
      collections: asset.collections.map((collection) => collection.name),
      rating: asset.rating,
      favorite: asset.favorite,
      memo: asset.memo,
      classificationCandidates: asset.audioAnalysis?.classification ?? [],
      loopScore: asset.audioAnalysis?.loopScore ?? null,
      peakDb: asset.audioAnalysis?.peakDb ?? null,
      rmsDb: asset.audioAnalysis?.rmsDb ?? null,
      playable: asset.playable,
      playbackSupportReason: asset.playbackSupportReason,
      engineKey: context.engineKey,
      usageHint: context.usageHint,
      rights: options.includeRights
        ? {
            sourceName: context.rights.sourceName || "TODO",
            sourceUrl: context.rights.sourceUrl || "TODO",
            author: context.rights.author || "TODO",
            licenseName: context.rights.licenseName || "TODO",
            licenseUrl: context.rights.licenseUrl || "TODO",
            attributionText: context.rights.attributionText || "TODO",
            usageNotes: context.rights.usageNotes || "TODO",
            commercialUseStatus: context.rights.commercialUseStatus,
            creditRequired: context.rights.creditRequired,
          }
        : undefined,
    };
  }
}

function describeSource(source: ExportSource, sourceLabel: string): string {
  if (source.type === "library") {
    return "whole library";
  }
  if (source.type === "selected") {
    return `selected assets (${source.assetIds.length})`;
  }
  return `${source.type}: ${sourceLabel}`;
}

function requestedOutputForTemplate(template: CodexInstructionTemplate): string {
  switch (template) {
    case "unity_import_plan":
      return "Create a Unity audio import plan, folder layout, AudioClip key map, and TODO list for missing metadata.";
    case "unreal_import_plan":
      return "Create an Unreal audio import plan, DataTable-friendly field map, and TODO list for missing metadata.";
    case "monogame_import_plan":
      return "Create a MonoGame Content Pipeline import plan and content list review notes.";
    case "generic_game_audio_manifest":
      return "Create a generic game audio manifest proposal using the supplied engine keys and usage hints.";
    case "rename_plan":
      return "Create a non-destructive rename plan. Do not rename original files.";
    case "tag_cleanup_plan":
      return "Create a tag cleanup plan that preserves user-authored tags and marks uncertain changes.";
    case "sound_usage_map":
      return "Create a sound usage map by game scene, system, and event name.";
    case "audio_replacement_candidates":
      return "Create a candidate list for replacing or consolidating similar game sounds.";
    case "custom_instruction":
    default:
      return "Follow the user goal above and produce the requested game-audio work product.";
  }
}

function formatMs(value: number | null | undefined): string {
  return Number.isFinite(value) ? `${Math.round(value as number)} ms` : "unknown";
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

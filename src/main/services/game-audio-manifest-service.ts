import { basename, extname } from "node:path";
import { APP_NAME } from "../../shared/app-metadata";
import type { AssetListItem, LibraryRecord } from "../../shared/library-types";
import type { AssetRightsMetadata, ExportAssetContext, ExportSource } from "../../shared/export-types";

export interface GameManifestOptions {
  includeCollections?: boolean;
  includeMemo?: boolean;
  includeRights?: boolean;
}

export class GameAudioManifestService {
  createContexts(
    assets: AssetListItem[],
    rightsByAssetId: Map<string, AssetRightsMetadata>,
    options: { groupBy?: "none" | "category" | "tag"; useSafeFilenames?: boolean } = {},
  ): ExportAssetContext[] {
    const keyCounts = new Map<string, number>();
    const fileCounts = new Map<string, number>();
    return assets.map((asset) => {
      const category = inferCategory(asset);
      const outputFileName = makeUnique(options.useSafeFilenames === false ? asset.fileName : safeFileName(asset.fileName), fileCounts);
      const engineKey = makeUnique(sanitizeEngineKey(asset.title || asset.fileName), keyCounts);
      const relativePath = createRelativeAudioPath(asset, outputFileName, category, options.groupBy ?? "category");
      return {
        asset,
        relativePath,
        outputFileName,
        category,
        engineKey,
        loop: isLoopCandidate(asset),
        volumeHint: 1,
        usageHint: `${category}.${engineKey}`,
        rights: rightsByAssetId.get(asset.id) ?? createEmptyRights(asset.id),
      };
    });
  }

  createGenericManifest(
    library: LibraryRecord,
    exportSource: ExportSource,
    sourceLabel: string,
    contexts: ExportAssetContext[],
    options: GameManifestOptions = {},
  ): Record<string, unknown> {
    return {
      app: APP_NAME,
      manifestVersion: 1,
      createdAt: new Date().toISOString(),
      libraryName: library.name,
      exportSource: {
        type: exportSource.type,
        name: sourceLabel,
      },
      assets: contexts.map((context) => createGenericAsset(context, options)),
    };
  }

  createUnityManifest(contexts: ExportAssetContext[]): Record<string, unknown> {
    return {
      engine: "unity",
      version: 1,
      audioClips: contexts.map((context) => ({
        key: context.engineKey,
        path: `Assets/Audio/${toPosixPath(context.relativePath)}`,
        category: context.category,
        loop: context.loop,
        volume: context.volumeHint,
        tags: context.asset.tags.map((tag) => tag.name),
      })),
    };
  }

  createUnrealManifest(contexts: ExportAssetContext[]): Record<string, unknown> {
    return {
      engine: "unreal",
      version: 1,
      audio: contexts.map((context) => ({
        Key: context.engineKey,
        FileName: context.outputFileName,
        RelativePath: toPosixPath(context.relativePath),
        Category: context.category,
        Loop: context.loop,
        Volume: context.volumeHint,
        Tags: context.asset.tags.map((tag) => tag.name),
        Notes: context.asset.memo,
      })),
    };
  }

  createUnrealCsv(contexts: ExportAssetContext[]): string {
    return toCsv(
      contexts.map((context) => ({
        Key: context.engineKey,
        FileName: context.outputFileName,
        RelativePath: toPosixPath(context.relativePath),
        Category: context.category,
        Loop: context.loop ? "true" : "false",
        Volume: context.volumeHint,
        Tags: context.asset.tags.map((tag) => tag.name).join(";"),
        Notes: context.asset.memo,
      })),
    );
  }

  createMonoGameManifest(contexts: ExportAssetContext[]): Record<string, unknown> {
    return {
      engine: "monogame",
      version: 1,
      content: contexts.map((context) => ({
        key: context.engineKey,
        path: toPosixPath(context.relativePath),
        importer: inferMonoGameImporter(context.outputFileName),
        processor: inferMonoGameProcessor(context.outputFileName),
        category: context.category,
        loop: context.loop,
      })),
    };
  }

  createMonoGameContentList(contexts: ExportAssetContext[]): string {
    return `${contexts
      .map((context) => {
        const path = toPosixPath(context.relativePath);
        return [
          `#begin ${path}`,
          `/importer:${inferMonoGameImporter(context.outputFileName)}`,
          `/processor:${inferMonoGameProcessor(context.outputFileName)}`,
          `/build:${path}`,
        ].join("\n");
      })
      .join("\n\n")}\n`;
  }
}

export function sanitizeEngineKey(input: string): string {
  const withoutExt = input.replace(new RegExp(`${escapeRegExp(extname(input))}$`, "i"), "");
  const ascii = withoutExt
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const key = ascii || "audio";
  return /^[0-9]/.test(key) ? `audio_${key}` : key;
}

export function safeFileName(input: string): string {
  const ext = extname(input);
  const stem = basename(input, ext)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  const safeStem = stem || "audio";
  const safeExt = ext.replace(/[^.\w]/g, "").toLowerCase();
  return `${safeStem}${safeExt}`;
}

export function makeUnique(value: string, counts: Map<string, number>): string {
  const current = counts.get(value) ?? 0;
  counts.set(value, current + 1);
  if (current === 0) {
    return value;
  }
  const ext = extname(value);
  if (!ext) {
    return `${value}_${current + 1}`;
  }
  return `${basename(value, ext)}_${current + 1}${ext}`;
}

export function inferCategory(asset: AssetListItem): string {
  const primary = asset.audioAnalysis?.classification[0]?.type;
  if (primary === "ui_sound") {
    return "ui";
  }
  if (primary === "music") {
    return "bgm";
  }
  if (primary === "voice") {
    return "voice";
  }
  if (primary === "ambience") {
    return "ambience";
  }
  if (primary === "sfx") {
    return "sfx";
  }
  const tagNames = asset.tags.map((tag) => tag.name.toLowerCase());
  if (tagNames.some((tag) => tag.includes("ui"))) {
    return "ui";
  }
  if (tagNames.some((tag) => tag.includes("bgm") || tag.includes("music"))) {
    return "bgm";
  }
  if (tagNames.some((tag) => tag.includes("voice"))) {
    return "voice";
  }
  if (tagNames.some((tag) => tag.includes("ambience"))) {
    return "ambience";
  }
  return "sfx";
}

export function toCsv(rows: Record<string, unknown>[]): string {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [keys.join(",")];
  for (const row of rows) {
    lines.push(keys.map((key) => csvCell(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function createEmptyRights(assetId: string): AssetRightsMetadata {
  const now = new Date().toISOString();
  return {
    assetId,
    sourceName: "",
    sourceUrl: "",
    author: "",
    licenseName: "",
    licenseUrl: "",
    attributionText: "",
    usageNotes: "",
    commercialUseStatus: "unknown",
    creditRequired: "unknown",
    createdAt: now,
    updatedAt: now,
  };
}

function createGenericAsset(context: ExportAssetContext, options: GameManifestOptions): Record<string, unknown> {
  const asset = context.asset;
  return {
    id: asset.id,
    name: basename(context.outputFileName, extname(context.outputFileName)),
    fileName: asset.fileName,
    relativePath: toPosixPath(context.relativePath),
    category: context.category,
    tags: asset.tags.map((tag) => tag.name),
    collections: options.includeCollections ? asset.collections.map((collection) => collection.name) : undefined,
    durationMs: asset.audioAnalysis?.durationMs ?? null,
    loop: context.loop,
    volumeHint: context.volumeHint,
    usageHint: context.usageHint,
    engineKey: context.engineKey,
    license: options.includeRights
      ? {
          name: context.rights.licenseName,
          author: context.rights.author,
          sourceUrl: context.rights.sourceUrl,
          attribution: context.rights.attributionText,
          commercialUseStatus: context.rights.commercialUseStatus,
          creditRequired: context.rights.creditRequired,
        }
      : undefined,
    memo: options.includeMemo ? asset.memo : undefined,
  };
}

function createRelativeAudioPath(asset: AssetListItem, outputFileName: string, category: string, groupBy: "none" | "category" | "tag"): string {
  if (groupBy === "none") {
    return outputFileName;
  }
  if (groupBy === "tag") {
    const tag = asset.tags[0]?.name ? safePathSegment(asset.tags[0].name) : category;
    return `${tag}/${outputFileName}`;
  }
  return `${safePathSegment(category)}/${outputFileName}`;
}

function safePathSegment(input: string): string {
  return sanitizeEngineKey(input).replace(/_+/g, "-") || "audio";
}

function isLoopCandidate(asset: AssetListItem): boolean {
  return asset.audioAnalysis?.loopLikelihood === "high" || (asset.audioAnalysis?.loopScore ?? 0) >= 0.72;
}

function inferMonoGameImporter(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".wav") {
    return "WavImporter";
  }
  if (ext === ".mp3") {
    return "Mp3Importer";
  }
  return "OggImporter";
}

function inferMonoGameProcessor(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  return ext === ".wav" ? "SoundEffectProcessor" : "SongProcessor";
}

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

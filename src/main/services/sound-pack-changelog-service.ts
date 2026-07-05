import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
  SoundPackChangelogFormat,
  SoundPackChangelogOptions,
  SoundPackChangelogPreview,
  SoundPackChangelogResult,
  SoundPackDiffChange,
  SoundPackDiffResult,
} from "../../shared/sound-board-types";
import { toCsv } from "./game-audio-manifest-service";
import type { SoundPackDiffService } from "./sound-pack-diff-service";

export class SoundPackChangelogService {
  constructor(private readonly diffService: SoundPackDiffService) {}

  async preview(input: SoundPackChangelogOptions): Promise<SoundPackChangelogPreview> {
    const format = input.format ?? "markdown";
    const diff = await this.diffService.compare(input);
    const filtered = filterDiff(diff, input);
    return {
      projectId: diff.projectId,
      format,
      fileName: fileNameForFormat(format),
      diff: filtered,
      previewText: renderChangelog(filtered, format),
    };
  }

  async export(input: SoundPackChangelogOptions, outputDirectory: string): Promise<SoundPackChangelogResult> {
    try {
      const preview = await this.preview(input);
      await mkdir(outputDirectory, { recursive: true });
      const outputPath = await writeUniqueTextFile(outputDirectory, preview.fileName, preview.previewText);
      return {
        ...preview,
        ok: true,
        outputPath,
        files: [outputPath],
      };
    } catch (error) {
      const format = input.format ?? "markdown";
      const fallback = emptyDiff(input.fromSnapshotId);
      return {
        projectId: input.projectId ?? "",
        format,
        fileName: fileNameForFormat(format),
        diff: fallback,
        previewText: "",
        ok: false,
        files: [],
        error: { code: "CHANGELOG_EXPORT_FAILED", message: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}

function filterDiff(diff: SoundPackDiffResult, options: SoundPackChangelogOptions): SoundPackDiffResult {
  const changes = diff.changes.filter((change) => {
    if (options.includeCandidateChanges === false && (change.type === "candidate_added" || change.type === "candidate_removed")) {
      return false;
    }
    if (options.includeRightsChanges === false && change.type === "rights_changed") {
      return false;
    }
    if (options.includeRiskChanges === false && change.type === "risk_changed") {
      return false;
    }
    return true;
  });
  return { ...diff, changes };
}

function renderChangelog(diff: SoundPackDiffResult, format: SoundPackChangelogFormat): string {
  if (format === "json") {
    return `${JSON.stringify(diff, null, 2)}\n`;
  }
  if (format === "csv") {
    return toCsv(
      diff.changes.map((change) => ({
        severity: change.severity,
        type: change.type,
        usageKey: change.usageKey,
        field: change.field ?? "",
        assetId: change.assetId ?? "",
        before: stringifyCell(change.before),
        after: stringifyCell(change.after),
        message: change.message,
      })),
    );
  }
  return [
    "# Sound Pack Changelog",
    "",
    `From: ${diff.fromName}`,
    `To: ${diff.toName}`,
    "",
    "## Summary",
    "",
    `- Added usage items: ${diff.summary.addedUsageItems}`,
    `- Removed usage items: ${diff.summary.removedUsageItems}`,
    `- Changed usage items: ${diff.summary.changedUsageItems}`,
    `- Selection changes: ${diff.summary.selectionChanges}`,
    `- Approval changes: ${diff.summary.approvalChanges}`,
    `- Candidate changes: ${diff.summary.candidateChanges}`,
    `- Rights changes: ${diff.summary.rightsChanges}`,
    `- Risk changes: ${diff.summary.riskChanges}`,
    `- Breaking changes: ${diff.summary.breakingChanges}`,
    "",
    "## Changes",
    "",
    ...(diff.changes.length === 0
      ? ["No sound pack changes detected."]
      : diff.changes.map((change) => `- [${change.severity}] ${change.type} / ${change.message}`)),
    "",
  ].join("\n");
}

function fileNameForFormat(format: SoundPackChangelogFormat): string {
  if (format === "json") {
    return "sound-pack-changelog.json";
  }
  if (format === "csv") {
    return "sound-pack-changelog.csv";
  }
  return "sound-pack-changelog.md";
}

function stringifyCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function writeUniqueTextFile(directory: string, fileName: string, content: string): Promise<string> {
  let candidate = join(directory, fileName);
  const ext = extname(fileName);
  const stem = basename(fileName, ext);
  let index = 2;
  while (await pathExists(candidate)) {
    candidate = join(directory, `${stem}-${index}${ext}`);
    index += 1;
  }
  await writeFile(candidate, content, "utf8");
  return candidate;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function emptyDiff(fromSnapshotId: string): SoundPackDiffResult {
  return {
    projectId: "",
    fromSnapshotId,
    toSnapshotId: null,
    toCurrent: false,
    fromName: "",
    toName: "",
    summary: {
      addedUsageItems: 0,
      removedUsageItems: 0,
      changedUsageItems: 0,
      selectionChanges: 0,
      approvalChanges: 0,
      candidateChanges: 0,
      assetChanges: 0,
      rightsChanges: 0,
      riskChanges: 0,
      breakingChanges: 0,
      warnings: 0,
    },
    changes: [],
  };
}

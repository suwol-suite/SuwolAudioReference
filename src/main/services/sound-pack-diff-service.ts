import { randomUUID } from "node:crypto";
import type {
  SoundPackCompareInput,
  SoundPackDiffChange,
  SoundPackDiffResult,
  SoundPackDiffSeverity,
  SoundPackDiffSummary,
  SoundPackSnapshotDetail,
  SoundPackSnapshotItemRecord,
} from "../../shared/sound-board-types";
import type { SoundPackSnapshotService } from "./sound-pack-snapshot-service";

export class SoundPackDiffService {
  constructor(private readonly snapshotService: SoundPackSnapshotService) {}

  async compare(input: SoundPackCompareInput): Promise<SoundPackDiffResult> {
    const from = await this.snapshotService.get(input.fromSnapshotId);
    if (!from) {
      throw new Error("SNAPSHOT_NOT_FOUND");
    }
    const to = input.compareToCurrent
      ? await this.snapshotService.createCurrent(input.projectId ?? from.projectId)
      : input.toSnapshotId
        ? await this.snapshotService.get(input.toSnapshotId)
        : await this.snapshotService.createCurrent(input.projectId ?? from.projectId);
    if (!to) {
      throw new Error("SNAPSHOT_NOT_FOUND");
    }
    if (from.projectId !== to.projectId) {
      throw new Error("SNAPSHOT_PROJECT_MISMATCH");
    }

    const changes: SoundPackDiffChange[] = [];
    const fromItems = new Map(from.items.map((item) => [item.usageKey, item]));
    const toItems = new Map(to.items.map((item) => [item.usageKey, item]));
    const usageKeys = Array.from(new Set([...fromItems.keys(), ...toItems.keys()])).sort();

    for (const usageKey of usageKeys) {
      const before = fromItems.get(usageKey);
      const after = toItems.get(usageKey);
      if (!before && after) {
        changes.push(createChange("usage_added", "warning", after, "Usage item was added.", undefined, after.snapshotJson.usageItem));
        continue;
      }
      if (before && !after) {
        changes.push(createChange("usage_removed", "breaking", before, "Usage item was removed.", before.snapshotJson.usageItem));
        continue;
      }
      if (!before || !after) {
        continue;
      }
      changes.push(...compareUsageItem(before, after));
      changes.push(...compareCandidates(before, after));
      changes.push(...compareRights(before, after));
    }

    changes.push(...compareRisks(from, to));

    return {
      projectId: from.projectId,
      fromSnapshotId: from.id,
      toSnapshotId: input.compareToCurrent ? null : to.id,
      toCurrent: Boolean(input.compareToCurrent || !input.toSnapshotId),
      fromName: from.name,
      toName: input.compareToCurrent || to.id === "current" ? "Current board" : to.name,
      summary: summarizeChanges(changes),
      changes,
    };
  }
}

function compareUsageItem(before: SoundPackSnapshotItemRecord, after: SoundPackSnapshotItemRecord): SoundPackDiffChange[] {
  const changes: SoundPackDiffChange[] = [];
  const fields: Array<keyof SoundPackSnapshotItemRecord> = [
    "displayName",
    "category",
    "status",
    "priority",
    "required",
    "loopRequired",
    "variantsAllowed",
  ];
  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes.push(createChange("usage_changed", field === "required" ? "warning" : "info", after, `${after.usageKey}: ${field} changed.`, before[field], after[field], field));
    }
  }
  if (!sameSet(before.selectedAssetIds, after.selectedAssetIds)) {
    changes.push(createChange("selection_changed", "warning", after, `${after.usageKey}: selected assets changed.`, before.selectedAssetIds, after.selectedAssetIds, "selectedAssetIds"));
  }
  if (!sameSet(before.approvedAssetIds, after.approvedAssetIds)) {
    changes.push(createChange("approval_changed", "warning", after, `${after.usageKey}: approved assets changed.`, before.approvedAssetIds, after.approvedAssetIds, "approvedAssetIds"));
  }
  return changes;
}

function compareCandidates(before: SoundPackSnapshotItemRecord, after: SoundPackSnapshotItemRecord): SoundPackDiffChange[] {
  const changes: SoundPackDiffChange[] = [];
  const beforeAssets = new Set(before.candidateAssetIds);
  const afterAssets = new Set(after.candidateAssetIds);
  for (const assetId of after.candidateAssetIds) {
    if (!beforeAssets.has(assetId)) {
      changes.push(createAssetChange("candidate_added", "info", after, assetId, `${after.usageKey}: candidate was added.`));
    }
  }
  for (const assetId of before.candidateAssetIds) {
    if (!afterAssets.has(assetId)) {
      changes.push(createAssetChange("candidate_removed", "info", before, assetId, `${before.usageKey}: candidate was removed.`));
    }
  }
  for (const beforeCandidate of before.snapshotJson.candidates) {
    const afterCandidate = after.snapshotJson.candidates.find((candidate) => candidate.assetId === beforeCandidate.assetId);
    if (!afterCandidate) {
      continue;
    }
    const beforeAsset = beforeCandidate.asset;
    const afterAsset = afterCandidate.asset;
    if (!beforeAsset || !afterAsset) {
      continue;
    }
    const assetFields = ["fileName", "contentHash", "fileSize", "fileMissing", "playable"] as const;
    for (const field of assetFields) {
      if (beforeAsset[field] !== afterAsset[field]) {
        changes.push(createAssetChange("asset_changed", field === "fileMissing" ? "breaking" : "warning", after, afterCandidate.assetId, `${after.usageKey}: selected asset ${field} changed.`, beforeAsset[field], afterAsset[field], field));
      }
    }
    const beforeDuration = beforeAsset.audioAnalysis?.durationMs ?? null;
    const afterDuration = afterAsset.audioAnalysis?.durationMs ?? null;
    if (beforeDuration !== afterDuration) {
      changes.push(createAssetChange("asset_changed", "info", after, afterCandidate.assetId, `${after.usageKey}: selected asset duration changed.`, beforeDuration, afterDuration, "durationMs"));
    }
  }
  return changes;
}

function compareRights(before: SoundPackSnapshotItemRecord, after: SoundPackSnapshotItemRecord): SoundPackDiffChange[] {
  const changes: SoundPackDiffChange[] = [];
  const assetIds = Array.from(new Set([...Object.keys(before.snapshotJson.rightsByAssetId), ...Object.keys(after.snapshotJson.rightsByAssetId)])).sort();
  for (const assetId of assetIds) {
    const beforeRights = before.snapshotJson.rightsByAssetId[assetId] ?? null;
    const afterRights = after.snapshotJson.rightsByAssetId[assetId] ?? null;
    if (JSON.stringify(beforeRights) !== JSON.stringify(afterRights)) {
      changes.push(createAssetChange("rights_changed", "warning", after, assetId, `${after.usageKey}: rights metadata changed.`, beforeRights, afterRights, "rights"));
    }
  }
  return changes;
}

function compareRisks(from: SoundPackSnapshotDetail, to: SoundPackSnapshotDetail): SoundPackDiffChange[] {
  const before = new Set(from.payload.validation.issues.map((issue) => `${issue.code}:${issue.usageKey ?? ""}:${issue.assetId ?? ""}`));
  const after = new Set(to.payload.validation.issues.map((issue) => `${issue.code}:${issue.usageKey ?? ""}:${issue.assetId ?? ""}`));
  const changes: SoundPackDiffChange[] = [];
  for (const key of after) {
    if (!before.has(key)) {
      const [code, usageKey = "project", assetId] = key.split(":");
      changes.push({
        id: randomUUID(),
        type: "risk_changed",
        severity: code?.includes("MISSING") ? "breaking" : "warning",
        usageKey: usageKey || "project",
        assetId: assetId || undefined,
        field: code,
        before: false,
        after: true,
        message: `${usageKey || "Project"}: risk added (${code}).`,
      });
    }
  }
  for (const key of before) {
    if (!after.has(key)) {
      const [code, usageKey = "project", assetId] = key.split(":");
      changes.push({
        id: randomUUID(),
        type: "risk_changed",
        severity: "info",
        usageKey: usageKey || "project",
        assetId: assetId || undefined,
        field: code,
        before: true,
        after: false,
        message: `${usageKey || "Project"}: risk resolved (${code}).`,
      });
    }
  }
  return changes;
}

function summarizeChanges(changes: SoundPackDiffChange[]): SoundPackDiffSummary {
  return {
    addedUsageItems: changes.filter((change) => change.type === "usage_added").length,
    removedUsageItems: changes.filter((change) => change.type === "usage_removed").length,
    changedUsageItems: new Set(changes.filter((change) => change.type === "usage_changed").map((change) => change.usageKey)).size,
    selectionChanges: changes.filter((change) => change.type === "selection_changed").length,
    approvalChanges: changes.filter((change) => change.type === "approval_changed").length,
    candidateChanges: changes.filter((change) => change.type === "candidate_added" || change.type === "candidate_removed").length,
    assetChanges: changes.filter((change) => change.type === "asset_changed").length,
    rightsChanges: changes.filter((change) => change.type === "rights_changed").length,
    riskChanges: changes.filter((change) => change.type === "risk_changed").length,
    breakingChanges: changes.filter((change) => change.severity === "breaking").length,
    warnings: changes.filter((change) => change.severity === "warning").length,
  };
}

function createChange(
  type: SoundPackDiffChange["type"],
  severity: SoundPackDiffSeverity,
  item: SoundPackSnapshotItemRecord,
  message: string,
  before?: unknown,
  after?: unknown,
  field?: string,
): SoundPackDiffChange {
  return {
    id: randomUUID(),
    type,
    severity,
    usageKey: item.usageKey,
    usageItemId: item.usageItemId,
    field,
    before,
    after,
    message,
  };
}

function createAssetChange(
  type: SoundPackDiffChange["type"],
  severity: SoundPackDiffSeverity,
  item: SoundPackSnapshotItemRecord,
  assetId: string,
  message: string,
  before?: unknown,
  after?: unknown,
  field?: string,
): SoundPackDiffChange {
  return {
    ...createChange(type, severity, item, message, before, after, field),
    assetId,
  };
}

function sameSet(left: string[], right: string[]): boolean {
  return left.slice().sort().join("\u0000") === right.slice().sort().join("\u0000");
}

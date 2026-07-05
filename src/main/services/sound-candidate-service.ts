import { randomUUID } from "node:crypto";
import type { BatchResult } from "../../shared/library-types";
import type { AssetListItem } from "../../shared/library-types";
import type {
  SoundCandidateFitReason,
  SoundCandidateSuggestInput,
  SoundCandidateSuggestion,
  SoundUsageCandidateInput,
  SoundUsageCandidateRecord,
  SoundUsageCandidateUpdateInput,
  SoundUsageCategory,
  SoundUsageItemRecord,
} from "../../shared/sound-board-types";
import type { AudioSimilarityService } from "./audio-similarity-service";
import type { AssetService } from "./asset-service";
import { createBatchResult, recordFailure, recordSuccess } from "./batch-result";
import type { LibraryService } from "./library-service";
import { boolToInt, intToBool, normalizeOptionalText } from "./sound-board-helpers";
import { SoundUsageService } from "./sound-usage-service";

interface SoundUsageCandidateRow {
  id: string;
  usage_item_id: string;
  asset_id: string;
  candidate_rank: number;
  fit_score: number | null;
  fit_reason_json: string;
  user_note: string;
  pros: string;
  cons: string;
  review_note: string;
  decision_reason: string;
  rating_for_usage: number | null;
  loudness_fit: string;
  loop_fit: string;
  mood_fit: string;
  selected: number;
  approved: number;
  rejected: number;
  created_at: string;
  updated_at: string;
}

export class SoundCandidateService {
  private readonly usageService: SoundUsageService;

  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly similarityService: AudioSimilarityService,
  ) {
    this.usageService = new SoundUsageService(libraryService, assetService);
  }

  async listCandidates(usageItemId: string): Promise<SoundUsageCandidateRecord[]> {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<SoundUsageCandidateRow>(
      `
      SELECT *
      FROM sound_usage_candidates
      WHERE usage_item_id = ?
      ORDER BY selected DESC, rejected ASC, candidate_rank ASC, fit_score DESC, created_at ASC
      `,
      [usageItemId],
    );
    return Promise.all(rows.map((row) => this.mapCandidateRow(row)));
  }

  async addCandidate(input: SoundUsageCandidateInput): Promise<SoundUsageCandidateRecord> {
    const context = this.libraryService.requireActive();
    const [usageItem, asset] = await Promise.all([
      this.usageService.getItem(input.usageItemId),
      this.assetService.getAsset(input.assetId),
    ]);
    if (!usageItem) {
      throw new Error("USAGE_ITEM_NOT_FOUND");
    }
    if (!asset || asset.libraryId !== context.library.id || asset.trashedAt) {
      throw new Error("ASSET_NOT_FOUND");
    }
    const existing = context.db.get<SoundUsageCandidateRow>(
      "SELECT * FROM sound_usage_candidates WHERE usage_item_id = ? AND asset_id = ?",
      [input.usageItemId, input.assetId],
    );
    if (existing) {
      return this.updateCandidate(existing.id, {
        candidateRank: input.candidateRank,
        fitScore: input.fitScore,
        fitReasons: input.fitReasons,
        userNote: input.userNote,
        pros: input.pros,
        cons: input.cons,
        reviewNote: input.reviewNote,
        decisionReason: input.decisionReason,
        ratingForUsage: input.ratingForUsage,
        loudnessFit: input.loudnessFit,
        loopFit: input.loopFit,
        moodFit: input.moodFit,
        selected: input.selected,
      });
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const selected = input.selected === true;
    context.db.transaction(() => {
      if (selected && !usageItem.variantsAllowed) {
        clearSelected(context, usageItem.id);
      }
      context.db.run(
        `
        INSERT INTO sound_usage_candidates (
          id, usage_item_id, asset_id, candidate_rank, fit_score, fit_reason_json,
          user_note, pros, cons, review_note, decision_reason, rating_for_usage,
          loudness_fit, loop_fit, mood_fit, selected, approved, rejected, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
        `,
        [
          id,
          input.usageItemId,
          input.assetId,
          input.candidateRank ?? nextCandidateRank(context, input.usageItemId),
          input.fitScore ?? null,
          JSON.stringify(input.fitReasons ?? []),
          normalizeOptionalText(input.userNote),
          normalizeOptionalText(input.pros),
          normalizeOptionalText(input.cons),
          normalizeOptionalText(input.reviewNote),
          normalizeOptionalText(input.decisionReason),
          normalizeRating(input.ratingForUsage),
          normalizeOptionalText(input.loudnessFit),
          normalizeOptionalText(input.loopFit),
          normalizeOptionalText(input.moodFit),
          selected ? 1 : 0,
          now,
          now,
        ],
      );
      updateUsageStatusAfterCandidateChange(context, usageItem);
    });
    const created = await this.getCandidate(id);
    if (!created) {
      throw new Error("CANDIDATE_CREATE_FAILED");
    }
    return created;
  }

  async updateCandidate(candidateId: string, input: SoundUsageCandidateUpdateInput): Promise<SoundUsageCandidateRecord> {
    const context = this.libraryService.requireActive();
    const current = await this.getCandidate(candidateId);
    if (!current) {
      throw new Error("CANDIDATE_NOT_FOUND");
    }
    const usageItem = await this.usageService.getItem(current.usageItemId);
    if (!usageItem) {
      throw new Error("USAGE_ITEM_NOT_FOUND");
    }
    const nextRejected = input.rejected === undefined ? current.rejected : input.rejected;
    const nextSelected = nextRejected ? false : input.selected === undefined ? current.selected : input.selected;
    const nextApproved = nextRejected ? false : input.approved === undefined ? current.approved : input.approved;
    if (nextApproved && !nextSelected) {
      throw new Error("APPROVE_REQUIRES_SELECTED_CANDIDATE");
    }
    context.db.transaction(() => {
      if (nextSelected && !usageItem.variantsAllowed) {
        clearSelected(context, usageItem.id, candidateId);
      }
      context.db.run(
        `
        UPDATE sound_usage_candidates
        SET candidate_rank = ?,
            fit_score = ?,
            fit_reason_json = ?,
            user_note = ?,
            pros = ?,
            cons = ?,
            review_note = ?,
            decision_reason = ?,
            rating_for_usage = ?,
            loudness_fit = ?,
            loop_fit = ?,
            mood_fit = ?,
            selected = ?,
            approved = ?,
            rejected = ?,
            updated_at = ?
        WHERE id = ?
        `,
        [
          input.candidateRank ?? current.candidateRank,
          input.fitScore === undefined ? current.fitScore : input.fitScore,
          JSON.stringify(input.fitReasons ?? current.fitReasons),
          input.userNote === undefined ? current.userNote : normalizeOptionalText(input.userNote),
          input.pros === undefined ? current.pros : normalizeOptionalText(input.pros),
          input.cons === undefined ? current.cons : normalizeOptionalText(input.cons),
          input.reviewNote === undefined ? current.reviewNote : normalizeOptionalText(input.reviewNote),
          input.decisionReason === undefined ? current.decisionReason : normalizeOptionalText(input.decisionReason),
          input.ratingForUsage === undefined ? current.ratingForUsage : normalizeRating(input.ratingForUsage),
          input.loudnessFit === undefined ? current.loudnessFit : normalizeOptionalText(input.loudnessFit),
          input.loopFit === undefined ? current.loopFit : normalizeOptionalText(input.loopFit),
          input.moodFit === undefined ? current.moodFit : normalizeOptionalText(input.moodFit),
          boolToInt(nextSelected),
          boolToInt(nextApproved),
          boolToInt(nextRejected),
          new Date().toISOString(),
          candidateId,
        ],
      );
      updateUsageStatusAfterCandidateChange(context, usageItem);
    });
    const updated = await this.getCandidate(candidateId);
    if (!updated) {
      throw new Error("CANDIDATE_UPDATE_FAILED");
    }
    return updated;
  }

  async removeCandidate(candidateId: string): Promise<boolean> {
    const context = this.libraryService.requireActive();
    const current = await this.getCandidate(candidateId);
    if (!current) {
      return false;
    }
    const usageItem = await this.usageService.getItem(current.usageItemId);
    context.db.transaction(() => {
      context.db.run("DELETE FROM sound_usage_candidates WHERE id = ?", [candidateId]);
      if (usageItem) {
        updateUsageStatusAfterCandidateChange(context, usageItem);
      }
    });
    return true;
  }

  async setSelected(candidateId: string, selected: boolean): Promise<SoundUsageCandidateRecord> {
    const current = await this.getCandidate(candidateId);
    if (!current) {
      throw new Error("CANDIDATE_NOT_FOUND");
    }
    if (selected && current.rejected) {
      throw new Error("REJECTED_CANDIDATE_RESTORE_REQUIRED");
    }
    return this.updateCandidate(candidateId, { selected, rejected: selected ? false : undefined });
  }

  setRejected(candidateId: string, rejected: boolean): Promise<SoundUsageCandidateRecord> {
    return this.updateCandidate(candidateId, { rejected, selected: rejected ? false : undefined, approved: rejected ? false : undefined });
  }

  async bulkAdd(input: { usageItemId: string; assetIds: string[]; selected?: boolean }): Promise<BatchResult> {
    const uniqueIds = Array.from(new Set(input.assetIds));
    const result = createBatchResult(uniqueIds.length);
    for (const assetId of uniqueIds) {
      try {
        await this.addCandidate({ usageItemId: input.usageItemId, assetId, selected: input.selected && uniqueIds.length === 1 });
        recordSuccess(result);
      } catch (error) {
        recordFailure(result, assetId, error instanceof Error ? error.message : String(error));
      }
    }
    return result;
  }

  findSimilarForUsage(input: SoundCandidateSuggestInput): Promise<SoundCandidateSuggestion[]> {
    return this.suggest(input);
  }

  async suggest(input: SoundCandidateSuggestInput): Promise<SoundCandidateSuggestion[]> {
    const usageItem = await this.usageService.getItem(input.usageItemId);
    if (!usageItem) {
      throw new Error("USAGE_ITEM_NOT_FOUND");
    }
    const existing = await this.listCandidates(input.usageItemId);
    const excludedIds = new Set(existing.map((candidate) => candidate.assetId));
    const limit = Math.max(1, Math.min(input.limit ?? 12, 30));
    const seedAssetId = input.seedAssetId ?? existing.find((candidate) => candidate.selected)?.assetId ?? existing[0]?.assetId;
    const suggestions = new Map<string, SoundCandidateSuggestion>();

    if (seedAssetId) {
      try {
        const similar = await this.similarityService.findForAsset({ assetId: seedAssetId, limit: Math.max(limit * 2, 12), threshold: 0.45 });
        for (const candidate of similar.candidates) {
          if (excludedIds.has(candidate.asset.id)) {
            continue;
          }
          const scored = scoreCandidateFit(usageItem, candidate.asset, candidate.score);
          suggestions.set(candidate.asset.id, {
            asset: candidate.asset,
            score: scored.score,
            reasons: [{ code: "similar_audio", message: `Similarity ${Math.round(candidate.score * 100)}%`, score: candidate.score }, ...scored.reasons],
            source: "similarity",
          });
        }
      } catch {
        // Similarity is opportunistic; fallback library scoring below still returns useful candidates.
      }
    }

    const assets = await this.listLibraryAssets();
    for (const asset of assets) {
      if (excludedIds.has(asset.id) || suggestions.has(asset.id)) {
        continue;
      }
      const scored = scoreCandidateFit(usageItem, asset);
      if (scored.score >= 0.35 || matchesCategory(usageItem.category, asset)) {
        suggestions.set(asset.id, { asset, score: scored.score, reasons: scored.reasons, source: "library" });
      }
    }

    return Array.from(suggestions.values())
      .sort((left, right) => right.score - left.score || Number(right.asset.favorite) - Number(left.asset.favorite))
      .slice(0, limit);
  }

  private async getCandidate(candidateId: string): Promise<SoundUsageCandidateRecord | null> {
    const context = this.libraryService.requireActive();
    const row = context.db.get<SoundUsageCandidateRow>("SELECT * FROM sound_usage_candidates WHERE id = ?", [candidateId]);
    return row ? this.mapCandidateRow(row) : null;
  }

  private async mapCandidateRow(row: SoundUsageCandidateRow): Promise<SoundUsageCandidateRecord> {
    return {
      id: row.id,
      usageItemId: row.usage_item_id,
      assetId: row.asset_id,
      candidateRank: row.candidate_rank,
      fitScore: row.fit_score,
      fitReasons: parseFitReasons(row.fit_reason_json),
      userNote: row.user_note,
      pros: row.pros,
      cons: row.cons,
      reviewNote: row.review_note,
      decisionReason: row.decision_reason,
      ratingForUsage: row.rating_for_usage,
      loudnessFit: row.loudness_fit,
      loopFit: row.loop_fit,
      moodFit: row.mood_fit,
      selected: intToBool(row.selected),
      approved: intToBool(row.approved),
      rejected: intToBool(row.rejected),
      asset: await this.assetService.getAsset(row.asset_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async listLibraryAssets(): Promise<AssetListItem[]> {
    const pageSize = 1000;
    const first = await this.assetService.listAssetPage({ page: 1, pageSize, includeTrashed: false });
    const items = [...first.items];
    const pages = Math.ceil(first.total / pageSize);
    for (let page = 2; page <= pages; page += 1) {
      const next = await this.assetService.listAssetPage({ page, pageSize, includeTrashed: false });
      items.push(...next.items);
    }
    return items.filter((asset) => asset.mediaType === "audio" && !asset.trashedAt);
  }
}

export function scoreCandidateFit(
  usageItem: Pick<
    SoundUsageItemRecord,
    "category" | "loopRequired" | "targetDurationMs" | "priority"
  >,
  asset: AssetListItem,
  similarityScore = 0,
): { score: number; reasons: SoundCandidateFitReason[] } {
  const reasons: SoundCandidateFitReason[] = [];
  let score = similarityScore * 0.35;
  if (matchesCategory(usageItem.category, asset)) {
    score += 0.22;
    reasons.push({ code: "category_match", message: "Category matches usage item", score: 0.22 });
  }
  const tagScore = tagMatchScore(usageItem.category, asset);
  if (tagScore > 0) {
    score += tagScore;
    reasons.push({ code: "tag_match", message: "Tags match usage category", score: tagScore });
  }
  const durationScore = durationMatchScore(usageItem.targetDurationMs, asset.audioAnalysis?.durationMs);
  if (durationScore > 0) {
    score += durationScore;
    reasons.push({ code: "duration_match", message: "Duration fits target", score: durationScore });
  }
  const loopScore = loopMatchScore(usageItem.loopRequired, asset);
  if (loopScore > 0) {
    score += loopScore;
    reasons.push({ code: "loop_match", message: "Loop requirement looks compatible", score: loopScore });
  }
  if (asset.rating > 0) {
    const ratingScore = Math.min(asset.rating, 5) * 0.025;
    score += ratingScore;
    reasons.push({ code: "rating_bonus", message: "Higher rated asset", score: ratingScore });
  }
  if (asset.favorite) {
    score += 0.05;
    reasons.push({ code: "favorite_bonus", message: "Favorite asset", score: 0.05 });
  }
  if (asset.playable && !asset.fileMissing) {
    score += 0.06;
    reasons.push({ code: "playable", message: "Playable local asset", score: 0.06 });
  }
  if (asset.fileMissing) {
    score -= 0.35;
    reasons.push({ code: "missing_file", message: "File is missing", score: -0.35 });
  }
  return { score: clamp01(score), reasons };
}

function updateUsageStatusAfterCandidateChange(context: ReturnType<LibraryService["requireActive"]>, usageItem: SoundUsageItemRecord): void {
  const state = context.db.get<{ total: number; selected_count: number; approved_count: number; rejected_count: number }>(
    `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN selected = 1 THEN 1 ELSE 0 END) AS selected_count,
      SUM(CASE WHEN approved = 1 THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN rejected = 1 THEN 1 ELSE 0 END) AS rejected_count
    FROM sound_usage_candidates
    WHERE usage_item_id = ?
    `,
    [usageItem.id],
  );
  const total = state?.total ?? 0;
  const selected = state?.selected_count ?? 0;
  const approved = state?.approved_count ?? 0;
  const rejected = state?.rejected_count ?? 0;
  let status: SoundUsageItemRecord["status"] = "missing";
  if (total === 0) {
    status = "missing";
  } else if (selected > 0 && approved > 0) {
    status = "approved";
  } else if (selected > 0) {
    status = "selected";
  } else if (rejected >= total) {
    status = "rejected";
  } else {
    status = usageItem.status === "missing" ? "needs_candidates" : "reviewing";
  }
  context.db.run("UPDATE sound_usage_items SET status = ?, updated_at = ? WHERE id = ?", [
    status,
    new Date().toISOString(),
    usageItem.id,
  ]);
}

function clearSelected(context: ReturnType<LibraryService["requireActive"]>, usageItemId: string, keepCandidateId?: string): void {
  context.db.run(
    `
    UPDATE sound_usage_candidates
    SET selected = 0, updated_at = ?
    WHERE usage_item_id = ?
      AND (? IS NULL OR id <> ?)
    `,
    [new Date().toISOString(), usageItemId, keepCandidateId ?? null, keepCandidateId ?? null],
  );
}

function nextCandidateRank(context: ReturnType<LibraryService["requireActive"]>, usageItemId: string): number {
  const row = context.db.get<{ next_rank: number }>(
    "SELECT COALESCE(MAX(candidate_rank), 0) + 1 AS next_rank FROM sound_usage_candidates WHERE usage_item_id = ?",
    [usageItemId],
  );
  return row?.next_rank ?? 1;
}

function matchesCategory(category: SoundUsageCategory, asset: AssetListItem): boolean {
  if (category === "other") {
    return false;
  }
  return inferAssetUsageCategory(asset) === normalizeCategory(category);
}

function inferAssetUsageCategory(asset: AssetListItem): SoundUsageCategory {
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
  const tags = asset.tags.map((tag) => tag.name.toLowerCase());
  if (tags.some((tag) => tag.includes("ui"))) {
    return "ui";
  }
  if (tags.some((tag) => tag.includes("bgm") || tag.includes("music"))) {
    return "bgm";
  }
  if (tags.some((tag) => tag.includes("voice"))) {
    return "voice";
  }
  if (tags.some((tag) => tag.includes("ambience") || tag.includes("ambient"))) {
    return "ambience";
  }
  return "sfx";
}

function normalizeCategory(category: SoundUsageCategory): SoundUsageCategory {
  return category === "music" ? "bgm" : category;
}

function tagMatchScore(category: SoundUsageCategory, asset: AssetListItem): number {
  const categoryText = normalizeCategory(category);
  const tags = asset.tags.map((tag) => tag.name.toLowerCase());
  return tags.some((tag) => tag.includes(categoryText) || (categoryText === "bgm" && tag.includes("music"))) ? 0.12 : 0;
}

function durationMatchScore(targetDurationMs: number | null, durationMs: number | null | undefined): number {
  if (!targetDurationMs || !durationMs) {
    return 0;
  }
  const diffRatio = Math.abs(durationMs - targetDurationMs) / Math.max(targetDurationMs, 1);
  return Math.max(0, 0.16 * (1 - diffRatio));
}

function loopMatchScore(loopRequired: boolean, asset: AssetListItem): number {
  if (!loopRequired) {
    return 0;
  }
  const loopScore = asset.audioAnalysis?.loopScore ?? 0;
  if (asset.audioAnalysis?.loopLikelihood === "high" || loopScore >= 0.72) {
    return 0.16;
  }
  if (loopScore >= 0.52) {
    return 0.07;
  }
  return 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseFitReasons(value: string): SoundCandidateFitReason[] {
  try {
    const parsed = JSON.parse(value) as SoundCandidateFitReason[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeRating(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(5, Math.round(value)));
}

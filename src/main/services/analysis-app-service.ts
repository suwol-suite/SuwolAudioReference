import { access } from "node:fs/promises";
import type { AudioAnalysisResult } from "../../shared/audio-analysis-types";
import type { ApplySuggestedTagsResult } from "../../shared/library-types";
import type { Locale } from "../../shared/i18n/locales";
import { getSuggestedTagLabelByKey } from "../../shared/i18n/suggested-tag-labels";
import { applySuggestedTagsToAsset } from "./audio-recommendation-service";
import { AudioAnalysisJobQueue } from "./audio-analysis-job-queue";
import { upsertAssetAudioAnalysis } from "./audio-analysis-repository";
import { decodeLocalPcmAudio } from "./audio-pcm-decoder-service";
import type { AudioFeatureService } from "./audio-feature-service";
import type { AssetService } from "./asset-service";
import type { LibraryService } from "./library-service";
import type { TagService } from "./tag-service";

export class AnalysisAppService {
  private readonly queue = new AudioAnalysisJobQueue(2);
  private featureService: AudioFeatureService | null = null;

  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly tagService: TagService,
  ) {}

  setFeatureService(featureService: AudioFeatureService): void {
    this.featureService = featureService;
  }

  async get(assetId: string): Promise<AudioAnalysisResult | null> {
    return this.assetService.getAnalysis(assetId);
  }

  async rerun(assetId: string): Promise<AudioAnalysisResult | null> {
    const context = this.libraryService.requireActive();
    const asset = await this.assetService.getAsset(assetId);
    if (!asset) {
      throw new Error("asset을 찾을 수 없습니다.");
    }

    const filePath = await getBestAnalysisPath(asset.originalPath, this.assetService.getAssetFilePath(asset));
    const jobResult = await this.queue.enqueue({
      assetId,
      filePath,
      decodePcm: decodeLocalPcmAudio,
      saveResult: async (id, result) => {
        await upsertAssetAudioAnalysis(context.db, id, result);
      },
    });

    if (!this.featureService) {
      return jobResult.result;
    }

    try {
      await this.featureService.saveFromAnalysis(assetId, jobResult.result);
      return jobResult.result;
    } catch (error) {
      return {
        ...jobResult.result,
        warnings: [
          ...jobResult.result.warnings,
          `feature_analysis_failed:${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  }

  async applySuggestedTags(assetId: string, tagNames: string[], locale: Locale = "ko"): Promise<ApplySuggestedTagsResult> {
    const analysis = await this.get(assetId);
    if (!analysis) {
      return { applied: [], alreadyLinked: [], skipped: tagNames };
    }

    const localizedSuggestions = analysis.suggestedTags.map((tag) => ({
      ...tag,
      tag: getSuggestedTagLabelByKey(tag.tagKey, locale) ?? tag.tag,
    }));

    return applySuggestedTagsToAsset(this.tagService.createRecommendationRepository(), assetId, localizedSuggestions, {
      selectedTagNames: tagNames,
    });
  }
}

async function getBestAnalysisPath(originalPath: string, fallbackPath: string): Promise<string> {
  try {
    await access(originalPath);
    return originalPath;
  } catch {
    return fallbackPath;
  }
}

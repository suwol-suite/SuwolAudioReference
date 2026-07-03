import type { AudioAnalysisResult } from "../../shared/audio-analysis-types";
import { analyzePcmAudio, type PcmAudioBuffer } from "./audio-analysis-service";
import { createAudioAnalysisResult } from "./audio-classifier-service";
import { extractAudioMetadata } from "./audio-metadata-service";

export interface AudioAnalysisJob {
  assetId: string;
  filePath: string;
  decodePcm?: (filePath: string) => Promise<PcmAudioBuffer>;
  saveResult?: (assetId: string, result: AudioAnalysisResult) => Promise<void>;
}

export interface AudioAnalysisJobResult {
  assetId: string;
  result: AudioAnalysisResult;
}

export class AudioAnalysisJobQueue {
  private readonly queue: Array<{
    job: AudioAnalysisJob;
    resolve: (value: AudioAnalysisJobResult) => void;
    reject: (reason: unknown) => void;
  }> = [];

  private activeCount = 0;

  constructor(private readonly concurrency = 2) {}

  enqueue(job: AudioAnalysisJob): Promise<AudioAnalysisJobResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) {
        return;
      }

      this.activeCount += 1;
      analyzeAudioJob(item.job)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.activeCount -= 1;
          this.pump();
        });
    }
  }
}

export async function analyzeAudioJob(job: AudioAnalysisJob): Promise<AudioAnalysisJobResult> {
  const warnings: string[] = [];
  const metadata = await extractAudioMetadata(job.filePath);
  let metrics;

  if (job.decodePcm) {
    try {
      metrics = analyzePcmAudio(await job.decodePcm(job.filePath));
    } catch (error) {
      warnings.push(`pcm_decode_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    warnings.push("pcm_decode_unavailable");
  }

  const result = createAudioAnalysisResult({ metadata, metrics }, warnings);

  try {
    await job.saveResult?.(job.assetId, result);
  } catch (error) {
    warnings.push(`analysis_save_failed:${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    assetId: job.assetId,
    result: warnings.length === result.warnings.length ? result : { ...result, warnings },
  };
}

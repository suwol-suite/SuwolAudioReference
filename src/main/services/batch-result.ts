import type { BatchResult } from "../../shared/library-types";

export function createBatchResult(requested: number): BatchResult {
  return {
    requested,
    success: 0,
    failed: 0,
    skipped: 0,
    failures: [],
    warnings: [],
  };
}

export function recordSuccess(result: BatchResult): void {
  result.success += 1;
}

export function recordSkipped(result: BatchResult, warning?: string): void {
  result.skipped += 1;
  if (warning) {
    result.warnings.push(warning);
  }
}

export function recordFailure(result: BatchResult, assetId: string, reason: string): void {
  result.failed += 1;
  result.failures.push({ assetId, reason });
}

import type { AssetListItem } from "../shared/library-types";

const MAX_GAIN_DB = 6;
const MIN_GAIN_DB = -12;

export interface PlaybackGainResult {
  gainDb: number;
  gainLinear: number;
  limitedByPeak: boolean;
}

export function calculateLoudnessMatchGain(
  asset: AssetListItem | null,
  reference: AssetListItem | null,
  enabled: boolean,
): PlaybackGainResult {
  if (!enabled || !asset?.audioAnalysis || !reference?.audioAnalysis) {
    return { gainDb: 0, gainLinear: 1, limitedByPeak: false };
  }

  const assetRms = asset.audioAnalysis.rmsDb;
  const referenceRms = reference.audioAnalysis.rmsDb;
  if (!Number.isFinite(assetRms) || !Number.isFinite(referenceRms)) {
    return { gainDb: 0, gainLinear: 1, limitedByPeak: false };
  }

  const peakLimit = Number.isFinite(asset.audioAnalysis.peakDb) ? 0 - (asset.audioAnalysis.peakDb as number) : MAX_GAIN_DB;
  const unclampedGain = (referenceRms as number) - (assetRms as number);
  const peakSafeGain = Math.min(unclampedGain, peakLimit);
  const gainDb = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, peakSafeGain));
  return {
    gainDb,
    gainLinear: dbToLinear(gainDb),
    limitedByPeak: peakSafeGain < unclampedGain,
  };
}

export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

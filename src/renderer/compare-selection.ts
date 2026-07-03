export function createRelatedCompareSelection(
  currentAssetId: string | null,
  candidateAssetId: string,
): { selectedIds: string[]; comparePairStart: number } {
  const selectedIds =
    currentAssetId && currentAssetId !== candidateAssetId ? [currentAssetId, candidateAssetId] : [candidateAssetId];
  return {
    selectedIds,
    comparePairStart: 0,
  };
}

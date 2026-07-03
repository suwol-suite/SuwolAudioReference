import type { SuggestedAudioTag } from "../../shared/audio-analysis-types";

export interface TagRecord {
  id: string;
  name: string;
}

export interface AssetTagRepository {
  findTagByName(name: string): Promise<TagRecord | null>;
  createTag(name: string): Promise<TagRecord>;
  getAssetTags(assetId: string): Promise<TagRecord[]>;
  linkTagToAsset(assetId: string, tagId: string): Promise<void>;
}

export interface ApplySuggestedTagsOptions {
  selectedTagNames?: string[];
}

export interface ApplySuggestedTagsResult {
  applied: TagRecord[];
  alreadyLinked: TagRecord[];
  skipped: string[];
}

export async function applySuggestedTagsToAsset(
  repository: AssetTagRepository,
  assetId: string,
  suggestedTags: SuggestedAudioTag[],
  options: ApplySuggestedTagsOptions = {},
): Promise<ApplySuggestedTagsResult> {
  const selected = new Set((options.selectedTagNames ?? suggestedTags.map((tag) => tag.tag)).map(normalizeTagName));
  const existingAssetTags = await repository.getAssetTags(assetId);
  const linkedByName = new Map(existingAssetTags.map((tag) => [normalizeTagName(tag.name), tag]));
  const dedupedSuggestions = dedupeSuggestions(suggestedTags).filter((tag) => selected.has(normalizeTagName(tag.tag)));
  const applied: TagRecord[] = [];
  const alreadyLinked: TagRecord[] = [];
  const skipped: string[] = [];

  for (const suggestion of dedupedSuggestions) {
    const normalized = normalizeTagName(suggestion.tag);
    const linked = linkedByName.get(normalized);

    if (linked) {
      alreadyLinked.push(linked);
      continue;
    }

    let tag = await repository.findTagByName(suggestion.tag);
    if (!tag) {
      tag = await repository.createTag(suggestion.tag);
    }

    if (linkedByName.has(normalizeTagName(tag.name))) {
      skipped.push(suggestion.tag);
      continue;
    }

    await repository.linkTagToAsset(assetId, tag.id);
    linkedByName.set(normalizeTagName(tag.name), tag);
    applied.push(tag);
  }

  return {
    applied,
    alreadyLinked,
    skipped,
  };
}

function dedupeSuggestions(suggestedTags: SuggestedAudioTag[]): SuggestedAudioTag[] {
  const byName = new Map<string, SuggestedAudioTag>();

  for (const suggestion of suggestedTags) {
    const key = normalizeTagName(suggestion.tag);
    const existing = byName.get(key);
    if (!existing || suggestion.confidence > existing.confidence) {
      byName.set(key, suggestion);
    }
  }

  return Array.from(byName.values()).sort((left, right) => right.confidence - left.confidence);
}

function normalizeTagName(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

import { describe, expect, it } from "vitest";
import type { SuggestedAudioTag } from "../../../shared/audio-analysis-types";
import {
  applySuggestedTagsToAsset,
  type AssetTagRepository,
  type TagRecord,
} from "../audio-recommendation-service";

describe("audio-recommendation-service", () => {
  it("reuses existing tags and avoids duplicate asset links", async () => {
    const repository = createInMemoryTagRepository(
      [
        { id: "tag-bgm", name: "BGM" },
        { id: "tag-ui", name: "UI사운드" },
      ],
      [{ id: "tag-bgm", name: "BGM" }],
    );

    const suggestions: SuggestedAudioTag[] = [
      { tag: "BGM", confidence: 0.9, source: "analysis", reasons: ["classification_music"] },
      { tag: "UI사운드", confidence: 0.8, source: "analysis", reasons: ["classification_ui_sound"] },
      { tag: "UI사운드", confidence: 0.7, source: "filename", reasons: ["filename_ui_keyword"] },
      { tag: "클릭", confidence: 0.7, source: "filename", reasons: ["filename_click_keyword"] },
    ];

    const result = await applySuggestedTagsToAsset(repository, "asset-1", suggestions, {
      selectedTagNames: ["BGM", "UI사운드", "클릭"],
    });

    expect(result.alreadyLinked.map((tag) => tag.name)).toEqual(["BGM"]);
    expect(result.applied.map((tag) => tag.name)).toEqual(["UI사운드", "클릭"]);
    expect(repository.links).toEqual(["tag-ui", "tag-3"]);
  });
});

function createInMemoryTagRepository(
  tags: TagRecord[],
  linkedTags: TagRecord[],
): AssetTagRepository & { links: string[] } {
  const allTags = [...tags];
  const links: string[] = [];

  return {
    links,
    async findTagByName(name) {
      return allTags.find((tag) => normalize(tag.name) === normalize(name)) ?? null;
    },
    async createTag(name) {
      const tag = { id: `tag-${allTags.length + 1}`, name };
      allTags.push(tag);
      return tag;
    },
    async getAssetTags() {
      return linkedTags;
    },
    async linkTagToAsset(_assetId, tagId) {
      links.push(tagId);
    },
  };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

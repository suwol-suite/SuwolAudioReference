import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProductionEntryPaths } from "../resource-paths";

describe("production resource paths", () => {
  it("resolves packaged entry paths relative to the app root", () => {
    const root = join("C:", "Apps", "Suwol Audio Reference", "resources", "app.asar");
    const paths = getProductionEntryPaths(root);

    expect(paths.mainEntry).toContain(join("dist", "main", "main.js"));
    expect(paths.preloadEntry).toContain(join("dist", "main", "preload.js"));
    expect(paths.rendererIndex).toContain(join("dist", "renderer", "index.html"));
    expect(paths.iconIco).toContain(join("build", "icon.ico"));
    expect(paths.thirdPartyNotices).toContain("THIRD_PARTY_NOTICES.md");
  });
});

import { join } from "node:path";

export interface ProductionEntryPaths {
  mainEntry: string;
  preloadEntry: string;
  rendererIndex: string;
  iconIco: string;
  iconPng: string;
  license: string;
  readme: string;
  thirdPartyNotices: string;
}

export function getProductionEntryPaths(appRoot: string): ProductionEntryPaths {
  return {
    mainEntry: join(appRoot, "dist", "main", "main.js"),
    preloadEntry: join(appRoot, "dist", "main", "preload.js"),
    rendererIndex: join(appRoot, "dist", "renderer", "index.html"),
    iconIco: join(appRoot, "build", "icon.ico"),
    iconPng: join(appRoot, "build", "icon.png"),
    license: join(appRoot, "LICENSE"),
    readme: join(appRoot, "README.md"),
    thirdPartyNotices: join(appRoot, "THIRD_PARTY_NOTICES.md"),
  };
}

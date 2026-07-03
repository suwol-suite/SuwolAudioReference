import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "dist/main/main.js",
  "dist/main/preload.js",
  "dist/renderer/index.html",
  "build/icon.ico",
  "build/icon.png",
  "assets/brand/icon.svg",
  "assets/brand/icon-256.png",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
];

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (packageJson.main !== "dist/main/main.js") {
  throw new Error(`Unexpected package main: ${packageJson.main}`);
}
if (packageJson.build?.productName !== "Suwol Audio Reference") {
  throw new Error("electron-builder productName is not Suwol Audio Reference");
}
if (packageJson.build?.appId !== "work.suwol.audio-reference") {
  throw new Error("electron-builder appId is not work.suwol.audio-reference");
}

for (const file of requiredFiles) {
  await access(join(root, file));
}

const mainBundle = await readFile(join(root, "dist/main/main.js"), "utf8");
for (const needle of [
  "Suwol Audio Reference",
  "work.suwol.audio-reference",
  "library.sqlite",
  ".suwol-audio",
  "requestSingleInstanceLock",
  "diagnostics:openLogFolder",
  "diagnostics:logRendererError",
]) {
  if (!mainBundle.includes(needle)) {
    throw new Error(`Main bundle does not contain expected marker: ${needle}`);
  }
}

const rendererIndex = await readFile(join(root, "dist", "renderer", "index.html"), "utf8");
const rendererAssetMatches = Array.from(rendererIndex.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g), (match) => match[1]);
if (rendererAssetMatches.length === 0) {
  throw new Error("Renderer index does not reference JS/CSS assets");
}
for (const assetPath of rendererAssetMatches) {
  if (assetPath.startsWith("/")) {
    throw new Error(`Renderer asset path must be relative for packaged file:// loading: ${assetPath}`);
  }
  await access(join(root, "dist", "renderer", assetPath.replace(/^\.\//, "")));
}
const rendererScriptPath = rendererAssetMatches.find((assetPath) => assetPath.endsWith(".js"));
if (!rendererScriptPath) {
  throw new Error("Renderer index does not reference a JS bundle");
}
const rendererBundle = await readFile(join(root, "dist", "renderer", rendererScriptPath.replace(/^\.\//, "")), "utf8");
for (const needle of ["Similar Sounds", "Open Log Folder", "The screen could not be rendered", "0.1.0"]) {
  if (!rendererBundle.includes(needle)) {
    throw new Error(`Renderer bundle does not contain expected i18n marker: ${needle}`);
  }
}

console.log("production entry smoke ok");

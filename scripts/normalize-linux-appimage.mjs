import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { releaseNames } from "./release-names.mjs";

const root = process.cwd();
const targetDirectory = resolve(process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ?? join(root, "release"));
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const names = releaseNames(packageJson.version);

async function main() {
  const files = await readdir(targetDirectory);
  const appImages = files.filter((file) => file.endsWith(".AppImage"));
  if (appImages.length === 0) {
    throw new Error(`No AppImage found in ${targetDirectory}`);
  }
  if (appImages.length > 1 && !appImages.includes(names.linuxAppImage)) {
    throw new Error(`Multiple AppImage files found: ${appImages.join(", ")}`);
  }

  const sourceAppImage = appImages.includes(names.linuxAppImage) ? names.linuxAppImage : appImages[0];
  await normalizeFile(sourceAppImage, names.linuxAppImage);

  const sourceBlockmap = `${sourceAppImage}.blockmap`;
  const targetBlockmap = `${names.linuxAppImage}.blockmap`;
  if (files.includes(sourceBlockmap)) {
    await normalizeFile(sourceBlockmap, targetBlockmap);
  } else {
    console.log(`linux AppImage blockmap sidecar not found; treating block map as embedded`);
  }

  await normalizeLatestLinux(sourceAppImage, names.linuxAppImage);
  console.log(`linux AppImage normalized: ${names.linuxAppImage}`);
}

async function normalizeFile(sourceName, targetName) {
  if (sourceName === targetName) {
    await assertNonEmpty(join(targetDirectory, targetName));
    return;
  }
  await rename(join(targetDirectory, sourceName), join(targetDirectory, targetName));
  await assertNonEmpty(join(targetDirectory, targetName));
  console.log(`renamed ${sourceName} -> ${targetName}`);
}

async function normalizeLatestLinux(sourceName, targetName) {
  const latestPath = join(targetDirectory, names.linuxLatest);
  let content = await readFile(latestPath, "utf8");
  content = replaceAllForms(content, sourceName, targetName);
  content = replaceAnyAppImageBasename(content, targetName);
  await writeFile(latestPath, content, "utf8");
  await assertNonEmpty(latestPath);
}

function replaceAllForms(content, sourceName, targetName) {
  const pairs = [
    [sourceName, targetName],
    [encodeURIComponent(sourceName), encodeURIComponent(targetName)],
    [`./${sourceName}`, `./${targetName}`],
    [`./${encodeURIComponent(sourceName)}`, `./${encodeURIComponent(targetName)}`],
  ];
  let next = content;
  for (const [from, to] of pairs) {
    next = next.split(from).join(to);
  }
  return next;
}

function replaceAnyAppImageBasename(content, targetName) {
  return content.replace(/([^/\s"'()]+\.AppImage)/g, (match) => {
    const decoded = safeDecode(match);
    if (basename(decoded) !== decoded || !decoded.endsWith(".AppImage")) {
      return match;
    }
    return match.includes("%") ? encodeURIComponent(targetName) : targetName;
  });
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function assertNonEmpty(path) {
  const stats = await stat(path);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`File is missing or empty: ${path}`);
  }
}

await main();

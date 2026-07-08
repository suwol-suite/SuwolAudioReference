import { access, readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { releaseNames } from "./release-names.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const explicitDirectory = args.find((arg) => !arg.startsWith("--"));
const targetDirectory = resolve(explicitDirectory ?? join(root, "release"));
const requireSignature = args.includes("--require-signature");
const requireChecksums = args.includes("--require-checksums") || requireSignature;

async function main() {
  if (!(await exists(targetDirectory))) {
    if (process.platform === "win32") {
      console.log(`linux updater artifact check skipped on Windows: ${targetDirectory}`);
      return;
    }
    throw new Error(`Linux updater artifact directory is missing: ${targetDirectory}`);
  }

  const files = await readdir(targetDirectory);
  if (process.platform === "win32" && !files.some((file) => file.endsWith(".AppImage"))) {
    console.log(`linux updater artifact check skipped on Windows: no AppImage in ${targetDirectory}`);
    return;
  }

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const names = releaseNames(packageJson.version);
  const appImage = files.includes(names.linuxAppImage)
    ? names.linuxAppImage
    : single(files, (file) => file.endsWith(".AppImage"), "Linux AppImage");
  const latestLinux = names.linuxLatest;

  await assertFile(appImage, "Linux AppImage");
  await assertFile(latestLinux, "latest-linux.yml");

  const blockmap = `${appImage}.blockmap`;
  if (files.includes(blockmap)) {
    await assertFile(blockmap, "Linux AppImage blockmap");
    console.log(`blockmap: ${blockmap}`);
  } else {
    console.log(`blockmap: embedded or not generated (${blockmap} not present)`);
  }

  const latestLinuxContent = await readFile(join(targetDirectory, latestLinux), "utf8");
  const references = latestLinuxReferences(latestLinuxContent);
  if (!references.includes(appImage)) {
    throw new Error(`latest-linux.yml does not reference ${appImage}`);
  }
  if (!/sha512:\s*\S+/m.test(latestLinuxContent)) {
    throw new Error("latest-linux.yml does not contain a sha512 entry");
  }
  const latestVersion = latestLinuxContent.match(/^version:\s*["']?([^"'\s]+)["']?/m)?.[1];
  if (!latestVersion) {
    throw new Error("latest-linux.yml does not contain a version entry");
  }
  if (latestVersion !== packageJson.version) {
    throw new Error(`latest-linux.yml version ${latestVersion} does not match package.json ${packageJson.version}`);
  }

  if (requireChecksums) {
    await assertFile(names.checksums, "checksums.txt");
    const checksumContent = await readFile(join(targetDirectory, names.checksums), "utf8");
    if (!checksumContent.split(/\r?\n/).some((line) => line.endsWith(`  ${appImage}`))) {
      throw new Error(`checksums.txt does not contain ${appImage}`);
    }
  }
  if (requireSignature) {
    await assertFile(names.checksumsSignature, "checksums.txt.asc");
  }

  console.log(`linux updater artifacts ok: ${basename(targetDirectory)}`);
  console.log(`appimage: ${appImage}`);
  console.log(`metadata: ${latestLinux}`);
}

function latestLinuxReferences(content) {
  const references = new Set();
  const decodedContent = safeDecode(content.replace(/\\/g, "/"));
  const rawKeys = [...content.matchAll(/^\s*(?:-\s*)?(?:url|path):\s*(.+?)\s*$/gm)].map((match) => match[1]);

  for (const rawReference of rawKeys) {
    const normalized = normalizeArtifactReference(rawReference);
    if (normalized) {
      references.add(normalized);
    }
  }

  for (const match of decodedContent.matchAll(/[^\s"'()]+\.AppImage/g)) {
    const normalized = normalizeArtifactReference(match[0]);
    if (normalized) {
      references.add(normalized);
    }
  }

  return [...references];
}

function normalizeArtifactReference(value) {
  let reference = String(value).trim().replace(/^["']|["']$/g, "");
  reference = reference.replace(/\\/g, "/").replace(/^\.\//, "");
  try {
    reference = new URL(reference).pathname;
  } catch {
    // Plain relative filenames are expected in electron-builder metadata.
  }
  reference = safeDecode(reference).replace(/\\/g, "/").replace(/^\.\//, "");
  return basename(reference);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function single(files, predicate, label) {
  const matches = files.filter(predicate);
  if (matches.length === 0) {
    throw new Error(`${label} is missing in ${targetDirectory}`);
  }
  if (matches.length > 1) {
    throw new Error(`${label} is ambiguous in ${targetDirectory}: ${matches.join(", ")}`);
  }
  return matches[0];
}

async function assertFile(fileName, label) {
  const path = join(targetDirectory, fileName);
  await access(path);
  const fileStats = await stat(path);
  if (!fileStats.isFile() || fileStats.size <= 0) {
    throw new Error(`${label} is missing or empty: ${path}`);
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

await main();

import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { releaseNames } from "./release-names.mjs";

const root = process.cwd();
const targetDirectory = resolve(process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? join(root, "release"));
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const names = releaseNames(packageJson.version);

async function main() {
  const files = await readdir(targetDirectory);
  const dmg = choose(files, ".dmg", names.macDmg, "macOS DMG");
  const zip = choose(files, ".zip", names.macZip, "macOS ZIP");

  await normalizeFile(dmg, names.macDmg);
  await normalizeFile(zip, names.macZip);

  if (!files.includes(names.macLatest)) {
    throw new Error(`${names.macLatest} is missing in ${targetDirectory}`);
  }
  await normalizeLatestMac(zip, names.macZip);
  console.log(`macOS artifacts normalized: ${names.macDmg}, ${names.macZip}`);
}

function choose(files, extension, preferredName, label) {
  if (files.includes(preferredName)) {
    return preferredName;
  }
  const matches = files.filter((file) => file.endsWith(extension));
  if (matches.length === 0) {
    throw new Error(`${label} is missing in ${targetDirectory}`);
  }
  if (matches.length > 1) {
    throw new Error(`${label} is ambiguous in ${targetDirectory}: ${matches.join(", ")}`);
  }
  return matches[0];
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

async function normalizeLatestMac(sourceName, targetName) {
  const latestPath = join(targetDirectory, names.macLatest);
  let content = await readFile(latestPath, "utf8");
  content = replaceAllForms(content, sourceName, targetName);
  content = replaceAnyZipBasename(content, targetName);
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

function replaceAnyZipBasename(content, targetName) {
  return content.replace(/([^/\s"'()]+\.zip)/g, (match) => {
    const decoded = safeDecode(match);
    if (basename(decoded) !== decoded || !decoded.endsWith(".zip")) {
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

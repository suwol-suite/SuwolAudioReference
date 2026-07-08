import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { releaseAssetNames, releaseNames } from "./release-names.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const targetDirectory = resolve(args.find((arg) => !arg.startsWith("--")) ?? join(root, "release-assets"));
const requireAll = args.includes("--require-all");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const names = releaseNames(version);

const FORBIDDEN = [
  /\.env$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.sqlite(?:3)?$/i,
  /\.db$/i,
  /private/i,
  /revocation/i,
  /^node_modules(?:\/|\\|$)/i,
  /^dist(?:\/|\\|$)/i,
  /^release(?:\/|\\|$)/i,
  /^out(?:\/|\\|$)/i,
];

async function main() {
  const files = await readdir(targetDirectory);
  const required = requireAll
    ? [...releaseAssetNames(version), names.checksums, names.checksumsSignature, names.versionedChecksums, names.versionedChecksumsSignature, names.publicKey]
    : releaseAssetNames(version).filter((fileName) => files.includes(fileName));

  if (required.length === 0) {
    throw new Error(`No release assets found in ${targetDirectory}`);
  }

  for (const fileName of required) {
    await assertNonEmpty(join(targetDirectory, fileName), fileName);
  }

  for (const fileName of files) {
    assertSafeAssetName(fileName);
  }

  if (files.includes(names.linuxLatest)) {
    await assertLatestMetadata(names.linuxLatest, names.linuxAppImage);
  } else if (requireAll) {
    throw new Error(`${names.linuxLatest} is missing`);
  }

  if (files.includes(names.macLatest)) {
    await assertLatestMetadata(names.macLatest, names.macZip);
  } else if (requireAll) {
    throw new Error(`${names.macLatest} is missing`);
  }

  console.log(`release assets verified: ${required.length} required files`);
}

async function assertLatestMetadata(fileName, expectedReference) {
  const content = await readFile(join(targetDirectory, fileName), "utf8");
  const latestVersion = content.match(/^version:\s*["']?([^"'\s]+)["']?/m)?.[1];
  if (latestVersion !== version) {
    throw new Error(`${fileName} version ${latestVersion ?? "(missing)"} does not match package.json ${version}`);
  }
  if (!/sha512:\s*\S+/m.test(content)) {
    throw new Error(`${fileName} does not contain sha512 metadata`);
  }
  if (!latestReferences(content).includes(expectedReference)) {
    throw new Error(`${fileName} does not reference ${expectedReference}`);
  }
}

function latestReferences(content) {
  const references = new Set();
  const decodedContent = safeDecode(content.replace(/\\/g, "/"));
  const rawKeys = [...content.matchAll(/^\s*(?:-\s*)?(?:url|path):\s*(.+?)\s*$/gm)].map((match) => match[1]);
  for (const rawReference of rawKeys) {
    const normalized = normalizeArtifactReference(rawReference);
    if (normalized) {
      references.add(normalized);
    }
  }
  for (const match of decodedContent.matchAll(/[^\s"'()]+\.(?:AppImage|zip)/g)) {
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
    // Plain relative filenames are expected.
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

function assertSafeAssetName(fileName) {
  for (const forbidden of FORBIDDEN) {
    if (forbidden.test(fileName)) {
      throw new Error(`Forbidden release asset name: ${fileName}`);
    }
  }
}

async function assertNonEmpty(path, label) {
  const stats = await stat(path);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`${label} is missing or empty: ${path}`);
  }
}

await main();

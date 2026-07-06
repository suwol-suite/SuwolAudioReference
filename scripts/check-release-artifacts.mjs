import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_APP_ID = "work.suwol.audio-reference";
const EXPECTED_PRODUCT_NAME = "Suwol Audio Reference";
const VALID_PLATFORMS = new Set(["win", "linux", "all"]);
const MIN_NODE_MAJOR = 24;

function parsePlatform(argv) {
  const explicit = argv.find((arg) => arg.startsWith("--platform="));
  if (explicit) {
    return explicit.split("=")[1];
  }
  const index = argv.indexOf("--platform");
  if (index >= 0) {
    return argv[index + 1];
  }
  return "win";
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

async function assertFile(path, label) {
  await access(path);
  const stats = await stat(path);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`${label} is missing or empty: ${path}`);
  }
}

async function assertDirectory(path, label) {
  await access(path);
  const stats = await stat(path);
  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${path}`);
  }
}

async function hasFile(path) {
  try {
    const stats = await stat(path);
    return stats.isFile() && stats.size > 0;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertPackagedResources(unpackedPath, label) {
  const resourcesPath = join(unpackedPath, "resources");
  await assertDirectory(resourcesPath, `${label} resources`);
  const resources = await readdir(resourcesPath);
  if (!resources.includes("app.asar") && !resources.includes("app")) {
    throw new Error(`${label} resources do not contain app.asar or app directory`);
  }
}

function assertNodeEngine(packageJson) {
  const nodeEngine = packageJson.engines?.node;
  if (typeof nodeEngine !== "string" || !nodeEngine.trim()) {
    throw new Error("package.json engines.node is missing");
  }
  const match = nodeEngine.match(/(?:>=|=|~|\^)?\s*(\d+)/);
  const major = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    throw new Error(`package.json engines.node must require Node ${MIN_NODE_MAJOR}+; found "${nodeEngine}"`);
  }
}

function targetNames(targets) {
  return targets.map((target) => String(target).toLowerCase());
}

function assertReleaseBuildMetadata(packageJson) {
  const winTargets = Array.isArray(packageJson.build?.win?.target)
    ? packageJson.build.win.target
    : [packageJson.build?.win?.target].filter(Boolean);
  const linuxTargets = Array.isArray(packageJson.build?.linux?.target)
    ? packageJson.build.linux.target
    : [packageJson.build?.linux?.target].filter(Boolean);
  const normalizedWinTargets = targetNames(winTargets);
  const normalizedLinuxTargets = targetNames(linuxTargets);
  const allowedWinTargets = new Set(["dir"]);
  const allowedLinuxTargets = new Set(["dir", "appimage", "tar.gz", "deb", "rpm"]);

  if (!normalizedWinTargets.includes("dir")) {
    throw new Error("package.json build.win.target must include dir for zip-first Windows packaging");
  }
  for (const target of ["dir", "appimage", "tar.gz"]) {
    if (!normalizedLinuxTargets.includes(target)) {
      throw new Error(`package.json build.linux.target must include ${target} for Linux release packaging`);
    }
  }
  for (const target of normalizedWinTargets) {
    if (!allowedWinTargets.has(target)) {
      throw new Error(`Windows installer/package target is outside the zip release scope: ${target}`);
    }
  }
  for (const target of normalizedLinuxTargets) {
    if (!allowedLinuxTargets.has(target)) {
      throw new Error(`Linux package target is outside the approved release scope: ${target}`);
    }
  }
}

function releaseArtifactName(productName, version, platformLabel) {
  return `${productName.replace(/\s+/g, ".")}.${version}.${platformLabel}.x64.zip`;
}

async function sha256File(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

async function assertChecksumEntry(root, zipPath) {
  const checksumPath = join(root, "release", "SHA256SUMS.txt");
  await assertFile(checksumPath, "SHA256SUMS");
  const checksumText = await readFile(checksumPath, "utf8");
  const expectedHash = await sha256File(zipPath);
  const expectedLine = `${expectedHash}  ${basename(zipPath)}`;
  if (!checksumText.split(/\r?\n/).includes(expectedLine)) {
    throw new Error(`SHA256SUMS.txt does not contain the expected checksum entry for ${basename(zipPath)}`);
  }
  return checksumPath;
}

async function assertLinuxExecutable(root, productName, packageName) {
  const linuxUnpacked = join(root, "release", "linux-unpacked");
  const candidates = [
    join(linuxUnpacked, packageName),
    join(linuxUnpacked, productName),
    join(linuxUnpacked, productName.replace(/\s+/g, "-").toLowerCase()),
  ];

  for (const candidate of candidates) {
    if (await hasFile(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Linux executable was not found in ${linuxUnpacked}`);
}

export async function checkReleaseArtifacts(root = process.cwd(), platform = "win", options = {}) {
  if (!VALID_PLATFORMS.has(platform)) {
    throw new Error(`Unknown release artifact platform "${platform}". Use win, linux, or all.`);
  }

  const packagePath = join(root, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const version = packageJson.version;
  const productName = packageJson.build?.productName;
  const appId = packageJson.build?.appId;

  if (!version || typeof version !== "string") {
    throw new Error("package.json version is missing");
  }
  if (productName !== EXPECTED_PRODUCT_NAME) {
    throw new Error(`Unexpected productName: ${productName}`);
  }
  if (appId !== EXPECTED_APP_ID) {
    throw new Error(`Unexpected appId: ${appId}`);
  }
  if (packageJson.license !== "Apache-2.0") {
    throw new Error(`Unexpected license: ${packageJson.license}`);
  }
  assertNodeEngine(packageJson);
  assertReleaseBuildMetadata(packageJson);

  const requiredFiles = [
    ["README.md", "README"],
    ["LICENSE", "LICENSE"],
    ["THIRD_PARTY_NOTICES.md", "third-party notices"],
    [`docs/release-notes-${version}.md`, "release notes"],
    ["docs/known-issues.md", "known issues"],
    ["docs/windows-distribution.md", "Windows distribution guide"],
    ["docs/linux-distribution.md", "Linux distribution guide"],
    ["docs/manual-qa.md", "manual QA guide"],
    ["docs/qa-checklist.md", "QA checklist"],
    ["docs/release-checklist.md", "release checklist"],
    ["build/icon.ico", "Windows icon"],
    ["build/icon.png", "app icon"],
  ];

  for (const [relativePath, label] of requiredFiles) {
    await assertFile(join(root, relativePath), label);
  }

  const result = {
    version,
    appId,
    productName,
    windowsZip: null,
    linuxZip: null,
    unpackedExe: null,
    linuxExecutable: null,
    checksums: null,
  };

  if (platform === "win" || platform === "all") {
    const winUnpacked = join(root, "release", "win-unpacked");
    await assertDirectory(winUnpacked, "Windows unpacked folder");
    const exe = join(winUnpacked, `${productName}.exe`);
    await assertFile(exe, "Windows unpacked executable");
    await assertPackagedResources(winUnpacked, "Windows unpacked");
    const windowsZip = join(root, "release", releaseArtifactName(productName, version, "Windows"));
    await assertFile(windowsZip, "Windows zip");
    if (options.requireChecksums) {
      result.checksums = await assertChecksumEntry(root, windowsZip);
    }
    result.unpackedExe = exe;
    result.windowsZip = windowsZip;
  }

  if (platform === "linux" || platform === "all") {
    const linuxUnpacked = join(root, "release", "linux-unpacked");
    await assertDirectory(linuxUnpacked, "Linux unpacked folder");
    const linuxExecutable = await assertLinuxExecutable(root, productName, packageJson.name);
    await assertPackagedResources(linuxUnpacked, "Linux unpacked");
    const linuxZip = join(root, "release", releaseArtifactName(productName, version, "Linux"));
    await assertFile(linuxZip, "Linux zip");
    if (options.requireChecksums) {
      result.checksums = await assertChecksumEntry(root, linuxZip);
    }
    result.linuxExecutable = linuxExecutable;
    result.linuxZip = linuxZip;
  }

  return result;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  const args = process.argv.slice(2);
  const platform = parsePlatform(args);
  const requireChecksums = hasFlag(args, "--require-checksums");
  const rootArg = args.find((arg) => !arg.startsWith("--") && arg !== platform);
  const root = rootArg ? resolve(rootArg) : process.cwd();
  const result = await checkReleaseArtifacts(root, platform, { requireChecksums });
  console.log(`release artifacts ok: ${result.productName} ${result.version} (${platform})`);
  if (result.windowsZip) {
    console.log(`windows zip: ${result.windowsZip}`);
    console.log(`windows unpacked: ${result.unpackedExe}`);
  }
  if (result.linuxZip) {
    console.log(`linux zip: ${result.linuxZip}`);
    console.log(`linux executable: ${result.linuxExecutable}`);
  }
  if (result.checksums) {
    console.log(`checksums: ${result.checksums}`);
  }
}

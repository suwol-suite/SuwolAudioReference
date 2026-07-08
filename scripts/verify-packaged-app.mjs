import { spawnSync } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PACKAGE_NAME, PRODUCT_NAME } from "./release-names.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const platform = readOption("--platform") ?? (process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux");
const targetDirectory = resolve(readOption("--dir") ?? join(root, "release"));
const requireNoSandbox = platform === "linux";
const noSandbox = args.includes("--no-sandbox");
const verifySignature = args.includes("--verify-signature");

if (requireNoSandbox && !noSandbox) {
  throw new Error("Linux packaged app verification must be called with --no-sandbox");
}

if (platform === "win") {
  await verifyWindows();
} else if (platform === "linux") {
  await verifyLinux();
} else if (platform === "mac") {
  await verifyMac();
} else {
  throw new Error(`Unknown packaged app platform: ${platform}`);
}

function readOption(name) {
  const explicit = args.find((arg) => arg.startsWith(`${name}=`));
  if (explicit) {
    return explicit.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function verifyWindows() {
  const unpacked = join(targetDirectory, "win-unpacked");
  await assertFile(join(unpacked, `${PRODUCT_NAME}.exe`), "Windows executable");
  await assertPackagedResources(unpacked, "Windows unpacked");
  console.log("packaged app verified: win");
}

async function verifyLinux() {
  const unpacked = join(targetDirectory, "linux-unpacked");
  const candidates = [join(unpacked, PACKAGE_NAME), join(unpacked, PRODUCT_NAME), join(unpacked, PRODUCT_NAME.replace(/\s+/g, "-").toLowerCase())];
  let executable = "";
  for (const candidate of candidates) {
    if (await isNonEmptyFile(candidate)) {
      executable = candidate;
      break;
    }
  }
  if (!executable) {
    throw new Error(`Linux executable was not found in ${unpacked}`);
  }
  await assertPackagedResources(unpacked, "Linux unpacked");
  console.log(`packaged app verified: linux ${executable} --no-sandbox`);
}

async function verifyMac() {
  const appPath = await findMacApp(targetDirectory);
  await access(appPath);
  if (verifySignature) {
    const result = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`codesign verification failed for ${appPath}\n${result.stderr || result.stdout}`);
    }
  }
  console.log(`packaged app verified: mac ${appPath}`);
}

async function findMacApp(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return join(directory, entry.name);
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === "mac-arm64") {
      return findMacApp(join(directory, entry.name));
    }
  }
  throw new Error(`macOS .app bundle was not found in ${directory}`);
}

async function assertPackagedResources(unpackedPath, label) {
  const resourcesPath = join(unpackedPath, "resources");
  await access(resourcesPath);
  const resources = await readdir(resourcesPath);
  if (!resources.includes("app.asar") && !resources.includes("app")) {
    throw new Error(`${label} resources do not contain app.asar or app directory`);
  }
  const appBundle = resources.includes("app.asar") ? join(resourcesPath, "app.asar") : join(resourcesPath, "app");
  const stats = await stat(appBundle);
  if (stats.size <= 0) {
    throw new Error(`${label} app bundle is empty`);
  }
}

async function assertFile(path, label) {
  if (!(await isNonEmptyFile(path))) {
    throw new Error(`${label} is missing or empty: ${path}`);
  }
}

async function isNonEmptyFile(path) {
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

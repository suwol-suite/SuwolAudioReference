import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const unpacked = join(root, "release", "win-unpacked");
const exe = join(unpacked, "Suwol Audio Reference.exe");
const resources = join(unpacked, "resources");
const windowsZip = join(root, "release", "Suwol Audio Reference 0.1.0 Windows x64.zip");

await access(exe);
await access(resources);

const resourceEntries = await readdir(resources);
if (!resourceEntries.includes("app.asar") && !resourceEntries.includes("app")) {
  throw new Error("Packaged resources do not contain app.asar or app directory");
}

const exeStat = await stat(exe);
if (exeStat.size <= 0) {
  throw new Error("Packaged exe is empty");
}

const appBundlePath = resourceEntries.includes("app.asar") ? join(resources, "app.asar") : join(resources, "app");
const appBundleStat = await stat(appBundlePath);
if (appBundleStat.size <= 0) {
  throw new Error("Packaged app bundle is empty");
}

try {
  const zipStat = await stat(windowsZip);
  if (zipStat.size <= 0) {
    throw new Error("Windows zip artifact is empty");
  }
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

console.log(`packaged paths smoke ok: ${exe}`);

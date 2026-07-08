import { rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { zipNameForTarget } from "./release-names.mjs";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName ?? "Suwol Audio Reference";
const version = packageJson.version;
const mode = process.argv[2] ?? "all";

const TARGETS = {
  win: {
    source: join(root, "release", "win-unpacked"),
    executable: join(root, "release", "win-unpacked", `${productName}.exe`),
    output: join(root, "release", zipNameForTarget(version, "win")),
    label: "Windows x64",
  },
  linux: {
    source: join(root, "release", "linux-unpacked"),
    executableCandidates: [
      join(root, "release", "linux-unpacked", packageJson.name),
      join(root, "release", "linux-unpacked", productName),
      join(root, "release", "linux-unpacked", productName.replace(/\s+/g, "-").toLowerCase()),
    ],
    output: join(root, "release", zipNameForTarget(version, "linux")),
    label: "Linux x64",
  },
};

function selectedTargets(input) {
  if (input === "all") {
    return ["win", "linux"];
  }
  if (input === "win" || input === "linux") {
    return [input];
  }
  throw new Error(`Unknown zip target "${input}". Use win, linux, or all.`);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertTargetReady(targetName) {
  const target = TARGETS[targetName];
  const sourceStats = await stat(target.source);
  if (!sourceStats.isDirectory()) {
    throw new Error(`${target.label} unpacked folder is not a directory: ${target.source}`);
  }

  if (target.executable) {
    const executableStats = await stat(target.executable);
    if (!executableStats.isFile() || executableStats.size <= 0) {
      throw new Error(`${target.label} executable is missing or empty: ${target.executable}`);
    }
    return;
  }

  for (const candidate of target.executableCandidates ?? []) {
    if (await pathExists(candidate)) {
      const executableStats = await stat(candidate);
      if (executableStats.isFile() && executableStats.size > 0) {
        return;
      }
    }
  }
  throw new Error(`${target.label} executable was not found in ${target.source}`);
}

async function run(command, args, options = {}) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(undefined);
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

async function zipWithPowerShell(source, output) {
  const command = [
    "$ErrorActionPreference = 'Stop';",
    "Compress-Archive",
    "-LiteralPath $env:SUWOL_ZIP_SOURCE",
    "-DestinationPath $env:SUWOL_ZIP_OUTPUT",
    "-Force",
  ].join(" ");

  await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    env: {
      ...process.env,
      SUWOL_ZIP_SOURCE: source,
      SUWOL_ZIP_OUTPUT: output,
    },
  });
}

async function zipWithZipCommand(source, output) {
  await run("zip", ["-r", output, "."], { cwd: source });
}

async function createZip(targetName) {
  const target = TARGETS[targetName];
  await assertTargetReady(targetName);
  await rm(target.output, { force: true });

  if (process.platform === "win32") {
    await zipWithPowerShell(target.source, target.output);
  } else {
    await zipWithZipCommand(target.source, target.output);
  }

  const zipStats = await stat(target.output);
  if (!zipStats.isFile() || zipStats.size <= 0) {
    throw new Error(`${target.label} zip was not created: ${target.output}`);
  }

  console.log(`${target.label} zip created: ${resolve(target.output)}`);
}

for (const targetName of selectedTargets(mode)) {
  await createZip(targetName);
}

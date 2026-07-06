import { access } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const electronDistPath = join(root, "node_modules", "electron", "dist");
const electronInstallScript = join(root, "node_modules", "electron", "install.js");

if (await exists(electronDistPath)) {
  console.log(`electron dist ready: ${electronDistPath}`);
} else {
  await assertExists(electronInstallScript);
  await run(process.execPath, [electronInstallScript]);
  await assertExists(electronDistPath);
  console.log(`electron dist installed: ${electronDistPath}`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertExists(path) {
  if (!(await exists(path))) {
    throw new Error(`Required path is missing: ${path}`);
  }
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

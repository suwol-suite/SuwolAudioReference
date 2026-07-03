import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const isWindows = process.platform === "win32";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const electronCommand = isWindows
  ? join(root, "node_modules", ".bin", "electron.cmd")
  : join(root, "node_modules", ".bin", "electron");
const rendererUrl = "http://127.0.0.1:5173";

const renderer = spawn(npmCommand, ["run", "dev:renderer"], {
  cwd: root,
  stdio: "inherit",
  shell: isWindows,
});

let electron;
let rendererReady = false;

for (let attempt = 0; attempt < 120; attempt += 1) {
  try {
    const response = await fetch(rendererUrl);
    if (response.ok) {
      rendererReady = true;
      break;
    }
  } catch {
    // The Vite server is still starting.
  }
  await delay(250);
}

if (!rendererReady) {
  console.error(`Renderer dev server did not become ready at ${rendererUrl}`);
  shutdown(1);
}

electron = spawn(electronCommand, ["."], {
  cwd: root,
  stdio: "inherit",
  shell: isWindows,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: rendererUrl,
  },
});

function shutdown(code = 0) {
  renderer.kill();
  electron?.kill();
  process.exit(code);
}

renderer.on("exit", (code) => {
  if (code && code !== 0) {
    shutdown(code);
  }
});

electron.on("exit", (code) => {
  shutdown(code ?? 0);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

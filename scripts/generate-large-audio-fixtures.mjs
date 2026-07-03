import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const args = parseArgs(process.argv.slice(2));
const outputDir = args.output ?? join(tmpdir(), `suwol-audio-large-fixtures-${Date.now()}`);
const counts = {
  sfx: Number(args.sfx ?? 100),
  ui: Number(args.ui ?? 100),
  loops: Number(args.loops ?? 50),
  ambience: Number(args.ambience ?? 50),
};

await mkdir(outputDir, { recursive: true });
await mkdir(join(outputDir, "sfx"), { recursive: true });
await mkdir(join(outputDir, "ui"), { recursive: true });
await mkdir(join(outputDir, "loops"), { recursive: true });
await mkdir(join(outputDir, "ambience"), { recursive: true });
await mkdir(join(outputDir, "edge-cases"), { recursive: true });

for (let index = 0; index < counts.sfx; index += 1) {
  await writeFile(
    join(outputDir, "sfx", `impact-${index.toString().padStart(4, "0")}.wav`),
    createWav(0.35 + (index % 9) * 0.08, (t) => Math.sin(t * Math.PI * (120 + (index % 12) * 20)) * Math.exp(-t * 7)),
  );
}

for (let index = 0; index < counts.ui; index += 1) {
  await writeFile(
    join(outputDir, "ui", `ui-click-${index.toString().padStart(4, "0")}.wav`),
    createWav(0.12 + (index % 5) * 0.04, (t) => Math.sin(t * Math.PI * (720 + (index % 7) * 60)) * Math.exp(-t * 14)),
  );
}

for (let index = 0; index < counts.loops; index += 1) {
  await writeFile(
    join(outputDir, "loops", `bgm-loop-${index.toString().padStart(4, "0")}.wav`),
    createWav(8 + (index % 8), (t) => Math.sin(t * Math.PI * 4) * 0.18 + Math.sin(t * Math.PI * (6 + (index % 3))) * 0.06),
  );
}

for (let index = 0; index < counts.ambience; index += 1) {
  await writeFile(
    join(outputDir, "ambience", `ambience-noise-${index.toString().padStart(4, "0")}.wav`),
    createWav(6 + (index % 6), (_t, sampleIndex) => pseudoNoise(sampleIndex + index * 997) * 0.075),
  );
}

const edgeCases = [
  ["한국어 파일명 클릭.wav", 0.3, (t) => Math.sin(t * Math.PI * 900) * Math.exp(-t * 10)],
  ["日本語-確認-ボタン.wav", 0.35, (t) => Math.sin(t * Math.PI * 640) * Math.exp(-t * 8)],
  ["中文 空格 提示音.wav", 0.4, (t) => Math.sin(t * Math.PI * 580) * Math.exp(-t * 7)],
  ["symbols [] # % & !.wav", 0.5, (t) => Math.sin(t * Math.PI * 330) * 0.16],
  [`very-long-${"path-segment-".repeat(10)}file.wav`, 0.8, (t) => Math.sin(t * Math.PI * 220) * 0.12],
  ["silence-start-large.wav", 2.5, (t) => (t < 0.7 ? 0 : Math.sin(t * Math.PI * 360) * 0.18)],
  ["silence-end-large.wav", 2.5, (t) => (t > 1.8 ? 0 : Math.sin(t * Math.PI * 360) * 0.18)],
];

for (const [name, durationSeconds, sample] of edgeCases) {
  await writeFile(join(outputDir, "edge-cases", name), createWav(durationSeconds, sample));
}

await copyFile(join(outputDir, "ui", "ui-click-0000.wav"), join(outputDir, "edge-cases", "duplicate-same-content.wav"));
await writeFile(join(outputDir, "edge-cases", "corrupted.wav"), Buffer.from("not a valid wav", "utf8"));
await writeFile(join(outputDir, "edge-cases", "empty.wav"), Buffer.alloc(0));
await writeFile(join(outputDir, "edge-cases", "metadata.json"), JSON.stringify({ fixture: true }, null, 2));
await writeFile(join(outputDir, "edge-cases", "archive.zip"), Buffer.from("PK\u0005\u0006".padEnd(22, "\0"), "binary"));
await writeFile(join(outputDir, "edge-cases", "unsupported.exe"), Buffer.from("MZ", "ascii"));

const total = counts.sfx + counts.ui + counts.loops + counts.ambience + edgeCases.length + 5;
console.log(`created ${total} fixture files at ${outputDir}`);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--") ? rawArgs[++index] : "true";
      parsed[key] = value;
    } else if (!parsed.output) {
      parsed.output = arg;
    }
  }
  return parsed;
}

function createWav(durationSeconds, sampleFn) {
  const sampleRate = 16000;
  const samples = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples; index += 1) {
    const t = index / sampleRate;
    const value = Math.max(-1, Math.min(1, sampleFn(t, index)));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
  }

  return buffer;
}

function pseudoNoise(index) {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

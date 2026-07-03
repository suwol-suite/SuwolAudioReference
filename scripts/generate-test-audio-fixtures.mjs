import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const outputDir = process.argv[2] ?? join(tmpdir(), `suwol-audio-fixtures-${Date.now()}`);
await mkdir(outputDir, { recursive: true });

const fixtures = [
  ["short-click.wav", 0.2, (t) => (t < 0.03 ? Math.sin(t * Math.PI * 880) * (1 - t / 0.03) : 0)],
  ["sfx-impact.wav", 1, (t) => Math.sin(t * Math.PI * 120) * Math.exp(-t * 6)],
  ["voice-like.wav", 3, (t) => Math.sin(t * Math.PI * 360) * 0.18 + Math.sin(t * Math.PI * 520) * 0.08],
  ["ambience-noise.wav", 30, (_t, index) => pseudoNoise(index) * 0.08],
  ["bgm-loop-like.wav", 20, (t) => Math.sin(t * Math.PI * 4) * 0.22 + Math.sin(t * Math.PI * 8) * 0.08],
  ["silence-start.wav", 3, (t) => (t < 0.8 ? 0 : Math.sin(t * Math.PI * 440) * 0.2)],
  ["silence-end.wav", 3, (t) => (t > 2.2 ? 0 : Math.sin(t * Math.PI * 440) * 0.2)],
  ["korean-file-name-클릭.wav", 0.4, (t) => Math.sin(t * Math.PI * 1000) * Math.exp(-t * 9)],
  ["button [confirm] #1.wav", 0.5, (t) => Math.sin(t * Math.PI * 760) * Math.exp(-t * 7)],
  [`long-file-name-${"reference-".repeat(14)}끝.wav`, 1, (t) => Math.sin(t * Math.PI * 220) * 0.15],
];

for (const [name, durationSeconds, sample] of fixtures) {
  await writeFile(join(outputDir, name), createWav(durationSeconds, sample));
}

await copyFile(join(outputDir, "short-click.wav"), join(outputDir, "duplicate-copy.wav"));
await writeFile(join(outputDir, "damaged.wav"), Buffer.from("not a wav file", "utf8"));
await writeFile(join(outputDir, "metadata.json"), JSON.stringify({ name: "metadata" }, null, 2));
await writeFile(join(outputDir, "archive.zip"), Buffer.from("PK\u0005\u0006".padEnd(22, "\0"), "binary"));
await writeFile(join(outputDir, "unsupported.exe"), Buffer.from("MZ", "ascii"));

console.log(outputDir);

function createWav(durationSeconds, sampleFn) {
  const sampleRate = 44100;
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

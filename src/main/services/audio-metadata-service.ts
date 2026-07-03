import { open, stat } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import type { AudioMetadata } from "../../shared/audio-analysis-types";

const HEADER_BYTES = 512 * 1024;

export async function extractAudioMetadata(filePath: string): Promise<AudioMetadata> {
  const fileStat = await stat(filePath);
  const header = await readHeader(filePath, HEADER_BYTES);
  const base = createPathMetadata(filePath, fileStat.size);
  const extension = base.extension.toLowerCase();

  if (extension === "wav" || extension === "wave") {
    return { ...base, ...parseWavHeader(header) };
  }

  if (extension === "mp3") {
    return { ...base, ...parseMp3Header(header, fileStat.size) };
  }

  if (extension === "ogg" || extension === "oga") {
    return { ...base, ...parseOggHeader(header) };
  }

  return {
    ...base,
    format: extension || undefined,
  };
}

export function createPathMetadata(filePath: string, byteLength?: number): AudioMetadata {
  const extension = extname(filePath).replace(/^\./, "").toLowerCase();

  return {
    fileName: basename(filePath),
    folderName: basename(dirname(filePath)),
    extension,
    byteLength,
    format: extension || undefined,
  };
}

async function readHeader(filePath: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(filePath, "r");

  try {
    const fileStat = await handle.stat();
    const length = Math.min(fileStat.size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

function parseWavHeader(header: Buffer): Partial<AudioMetadata> {
  if (header.length < 44 || header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") {
    return { format: "wav", codec: "unknown" };
  }

  let offset = 12;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let byteRate: number | undefined;
  let bitsPerSample: number | undefined;
  let dataSize: number | undefined;
  let audioFormat: number | undefined;

  while (offset + 8 <= header.length) {
    const chunkId = header.toString("ascii", offset, offset + 4);
    const chunkSize = header.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt " && chunkStart + 16 <= header.length) {
      audioFormat = header.readUInt16LE(chunkStart);
      channels = header.readUInt16LE(chunkStart + 2);
      sampleRate = header.readUInt32LE(chunkStart + 4);
      byteRate = header.readUInt32LE(chunkStart + 8);
      bitsPerSample = header.readUInt16LE(chunkStart + 14);
    }

    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  const durationMs = byteRate && dataSize ? (dataSize / byteRate) * 1000 : undefined;
  const codec =
    audioFormat === 1
      ? `pcm_s${bitsPerSample ?? "unknown"}le`
      : audioFormat === 3
        ? `float${bitsPerSample ?? "unknown"}`
        : "wav";

  return {
    format: "wav",
    codec,
    channels,
    sampleRate,
    bitrate: byteRate ? byteRate * 8 : undefined,
    durationMs,
  };
}

function parseMp3Header(header: Buffer, byteLength: number): Partial<AudioMetadata> {
  const frameOffset = findMp3FrameOffset(header);
  if (frameOffset < 0 || frameOffset + 4 > header.length) {
    return { format: "mp3", codec: "mp3" };
  }

  const byte1 = header[frameOffset + 1];
  const byte2 = header[frameOffset + 2];
  const byte3 = header[frameOffset + 3];
  const versionBits = (byte1 >> 3) & 0b11;
  const layerBits = (byte1 >> 1) & 0b11;
  const bitrateIndex = (byte2 >> 4) & 0b1111;
  const sampleRateIndex = (byte2 >> 2) & 0b11;
  const channelMode = (byte3 >> 6) & 0b11;
  const version = versionBits === 0b11 ? "mpeg1" : versionBits === 0b10 ? "mpeg2" : "mpeg2.5";
  const layer = layerBits === 0b01 ? "layer3" : layerBits === 0b10 ? "layer2" : "layer1";
  const bitrateKbps = getMp3BitrateKbps(version, layer, bitrateIndex);
  const sampleRate = getMp3SampleRate(version, sampleRateIndex);
  const bitrate = bitrateKbps ? bitrateKbps * 1000 : undefined;
  const durationMs = bitrate ? (byteLength * 8 * 1000) / bitrate : undefined;

  return {
    format: "mp3",
    codec: "mp3",
    channels: channelMode === 0b11 ? 1 : 2,
    sampleRate,
    bitrate,
    durationMs,
  };
}

function parseOggHeader(header: Buffer): Partial<AudioMetadata> {
  if (header.toString("ascii", 0, 4) !== "OggS") {
    return { format: "ogg", codec: "unknown" };
  }

  const opusOffset = header.indexOf("OpusHead", 0, "ascii");
  if (opusOffset >= 0 && opusOffset + 19 <= header.length) {
    return {
      format: "ogg",
      codec: "opus",
      channels: header.readUInt8(opusOffset + 9),
      sampleRate: header.readUInt32LE(opusOffset + 12),
    };
  }

  const vorbisOffset = header.indexOf("vorbis", 0, "ascii");
  if (vorbisOffset >= 0 && vorbisOffset + 16 <= header.length) {
    return {
      format: "ogg",
      codec: "vorbis",
      channels: header.readUInt8(vorbisOffset + 10),
      sampleRate: header.readUInt32LE(vorbisOffset + 11),
    };
  }

  return {
    format: "ogg",
    codec: "unknown",
  };
}

function findMp3FrameOffset(header: Buffer): number {
  let offset = 0;

  if (header.toString("ascii", 0, 3) === "ID3" && header.length >= 10) {
    offset = 10 + readSynchsafeInteger(header, 6);
  }

  for (let index = offset; index + 1 < header.length; index += 1) {
    if (header[index] === 0xff && (header[index + 1] & 0xe0) === 0xe0) {
      return index;
    }
  }

  return -1;
}

function readSynchsafeInteger(buffer: Buffer, offset: number): number {
  return (
    ((buffer[offset] ?? 0) << 21) |
    ((buffer[offset + 1] ?? 0) << 14) |
    ((buffer[offset + 2] ?? 0) << 7) |
    (buffer[offset + 3] ?? 0)
  );
}

function getMp3BitrateKbps(version: string, layer: string, index: number): number | undefined {
  if (index <= 0 || index >= 15) {
    return undefined;
  }

  const mpeg1Layer3 = [undefined, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Layer3 = [undefined, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const layer2 = [undefined, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];
  const layer1 = [undefined, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448];

  if (layer === "layer1") {
    return layer1[index];
  }

  if (layer === "layer2") {
    return layer2[index];
  }

  return version === "mpeg1" ? mpeg1Layer3[index] : mpeg2Layer3[index];
}

function getMp3SampleRate(version: string, index: number): number | undefined {
  if (index >= 3) {
    return undefined;
  }

  const mpeg1 = [44100, 48000, 32000];
  const mpeg2 = [22050, 24000, 16000];
  const mpeg25 = [11025, 12000, 8000];

  if (version === "mpeg1") {
    return mpeg1[index];
  }

  if (version === "mpeg2") {
    return mpeg2[index];
  }

  return mpeg25[index];
}

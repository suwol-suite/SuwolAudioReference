import { readFile } from "node:fs/promises";
import type { PcmAudioBuffer } from "./audio-analysis-service";
import { clamp } from "./waveform-service";

interface WavFmtChunk {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
}

export async function decodeLocalPcmAudio(filePath: string): Promise<PcmAudioBuffer> {
  const buffer = await readFile(filePath);
  return decodeWavPcm(buffer);
}

export function decodeWavPcm(buffer: Buffer): PcmAudioBuffer {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("unsupported_pcm_container");
  }

  let offset = 12;
  let fmt: WavFmtChunk | null = null;
  let dataStart = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(buffer.length, chunkStart + chunkSize);

    if (chunkId === "fmt " && chunkStart + 16 <= chunkEnd) {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === "data") {
      dataStart = chunkStart;
      dataSize = chunkEnd - chunkStart;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataStart < 0 || dataSize <= 0) {
    throw new Error("wav_pcm_missing_chunks");
  }
  if (fmt.channels <= 0 || fmt.sampleRate <= 0 || fmt.blockAlign <= 0) {
    throw new Error("wav_pcm_invalid_format");
  }
  if (fmt.audioFormat !== 1 && fmt.audioFormat !== 3) {
    throw new Error("wav_codec_not_pcm");
  }

  const bytesPerSample = Math.max(1, Math.floor(fmt.bitsPerSample / 8));
  if (![1, 2, 3, 4, 8].includes(bytesPerSample)) {
    throw new Error("wav_pcm_unsupported_bit_depth");
  }

  const frameCount = Math.floor(dataSize / fmt.blockAlign);
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frameCount));

  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameOffset = dataStart + frame * fmt.blockAlign;
    for (let channel = 0; channel < fmt.channels; channel += 1) {
      const sampleOffset = frameOffset + channel * bytesPerSample;
      channels[channel]![frame] = readPcmSample(buffer, sampleOffset, fmt.audioFormat, fmt.bitsPerSample);
    }
  }

  return {
    channels,
    sampleRate: fmt.sampleRate,
    bitrate: fmt.byteRate * 8,
    codec: fmt.audioFormat === 3 ? `float${fmt.bitsPerSample}` : `pcm_s${fmt.bitsPerSample}le`,
    format: "wav",
  };
}

function readPcmSample(buffer: Buffer, offset: number, audioFormat: number, bitsPerSample: number): number {
  if (offset < 0 || offset >= buffer.length) {
    return 0;
  }

  if (audioFormat === 3) {
    if (bitsPerSample === 32 && offset + 4 <= buffer.length) {
      return clamp(buffer.readFloatLE(offset), -1, 1);
    }
    if (bitsPerSample === 64 && offset + 8 <= buffer.length) {
      return clamp(buffer.readDoubleLE(offset), -1, 1);
    }
    throw new Error("wav_float_unsupported_bit_depth");
  }

  if (bitsPerSample === 8) {
    return ((buffer.readUInt8(offset) - 128) / 128);
  }
  if (bitsPerSample === 16 && offset + 2 <= buffer.length) {
    return clamp(buffer.readInt16LE(offset) / 32768, -1, 1);
  }
  if (bitsPerSample === 24 && offset + 3 <= buffer.length) {
    const unsigned = buffer.readUIntLE(offset, 3);
    const signed = unsigned & 0x800000 ? unsigned | 0xff000000 : unsigned;
    return clamp(signed / 8388608, -1, 1);
  }
  if (bitsPerSample === 32 && offset + 4 <= buffer.length) {
    return clamp(buffer.readInt32LE(offset) / 2147483648, -1, 1);
  }

  throw new Error("wav_pcm_unsupported_bit_depth");
}

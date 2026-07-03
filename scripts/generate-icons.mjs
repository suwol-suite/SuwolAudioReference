import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const sizes = [16, 32, 48, 64, 128, 256, 512];
const brandDir = join(process.cwd(), "assets", "brand");
const buildDir = join(process.cwd(), "build");

await mkdir(brandDir, { recursive: true });
await mkdir(buildDir, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Suwol Audio Reference icon">
  <defs>
    <linearGradient id="bg" x1="64" y1="48" x2="448" y2="464" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1b2528"/>
      <stop offset="1" stop-color="#0e1114"/>
    </linearGradient>
    <linearGradient id="wave" x1="104" y1="128" x2="408" y2="376" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#55c7a5"/>
      <stop offset="1" stop-color="#7aa7ff"/>
    </linearGradient>
  </defs>
  <rect x="32" y="32" width="448" height="448" rx="108" fill="url(#bg)"/>
  <path d="M142 146h228c24 0 44 20 44 44v176c0 24-20 44-44 44H142c-24 0-44-20-44-44V190c0-24 20-44 44-44z" fill="#151a1d" stroke="#334148" stroke-width="16"/>
  <path d="M151 146v-28c0-20 16-36 36-36h138c20 0 36 16 36 36v28" fill="none" stroke="#334148" stroke-width="18" stroke-linecap="round"/>
  <path d="M142 270h228" stroke="#2a3338" stroke-width="18" stroke-linecap="round"/>
  <path d="M148 315c24-47 48-47 72 0s48 47 72 0 48-47 72 0" fill="none" stroke="url(#wave)" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M151 222h210" stroke="#55c7a5" stroke-width="18" stroke-linecap="round"/>
</svg>
`;

await writeFile(join(brandDir, "icon.svg"), svg, "utf8");

const pngBuffers = [];
for (const size of sizes) {
  const png = encodeIconPng(size);
  pngBuffers.push({ size, png });
  await writeFile(join(brandDir, `icon-${size}.png`), png);
}

await writeFile(join(buildDir, "icon.png"), pngBuffers.find((item) => item.size === 512).png);
await writeFile(join(buildDir, "icon.ico"), encodeIco(pngBuffers.filter((item) => [16, 32, 48, 64, 128, 256].includes(item.size))));

function encodeIconPng(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const inside = roundedRectContains(x + 0.5, y + 0.5, size * 0.06, size * 0.06, size * 0.88, size * 0.88, radius);
      if (!inside) {
        pixels[index + 3] = 0;
        continue;
      }

      const gradient = (x + y) / (size * 2);
      const vignette = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (size * 0.74));
      const bg = mix([27, 37, 40], [14, 17, 20], gradient);
      pixels[index] = clamp(bg[0] + vignette * 10);
      pixels[index + 1] = clamp(bg[1] + vignette * 10);
      pixels[index + 2] = clamp(bg[2] + vignette * 10);
      pixels[index + 3] = 255;
    }
  }

  const draw = createPainter(pixels, size);
  draw.roundRect(size * 0.19, size * 0.29, size * 0.62, size * 0.47, size * 0.08, [21, 26, 29, 255], [51, 65, 72, 255], Math.max(1, size * 0.028));
  draw.line(size * 0.31, size * 0.29, size * 0.31, size * 0.23, [51, 65, 72, 255], Math.max(1, size * 0.035));
  draw.line(size * 0.69, size * 0.29, size * 0.69, size * 0.23, [51, 65, 72, 255], Math.max(1, size * 0.035));
  draw.line(size * 0.34, size * 0.23, size * 0.66, size * 0.23, [51, 65, 72, 255], Math.max(1, size * 0.035));
  draw.line(size * 0.28, size * 0.44, size * 0.72, size * 0.44, [85, 199, 165, 255], Math.max(2, size * 0.035));
  draw.line(size * 0.28, size * 0.56, size * 0.72, size * 0.56, [42, 51, 56, 255], Math.max(2, size * 0.035));

  const waveWidth = Math.max(2, size * 0.045);
  let prev = null;
  for (let step = 0; step <= 96; step += 1) {
    const t = step / 96;
    const x = size * (0.28 + t * 0.44);
    const y = size * (0.65 + Math.sin(t * Math.PI * 6) * 0.052);
    if (prev) {
      const color = mix([85, 199, 165], [122, 167, 255], t);
      draw.line(prev.x, prev.y, x, y, [...color, 255], waveWidth);
    }
    prev = { x, y };
  }

  return encodePng(size, size, pixels);
}

function createPainter(pixels, size) {
  return {
    roundRect(x, y, width, height, radius, fill, stroke, strokeWidth) {
      for (let yy = Math.floor(y); yy <= Math.ceil(y + height); yy += 1) {
        for (let xx = Math.floor(x); xx <= Math.ceil(x + width); xx += 1) {
          if (roundedRectContains(xx + 0.5, yy + 0.5, x, y, width, height, radius)) {
            paintPixel(pixels, size, xx, yy, fill);
          }
        }
      }
      if (strokeWidth > 0) {
        for (let inset = 0; inset < Math.ceil(strokeWidth); inset += 1) {
          this.line(x + radius, y + inset, x + width - radius, y + inset, stroke, 1);
          this.line(x + radius, y + height - inset, x + width - radius, y + height - inset, stroke, 1);
          this.line(x + inset, y + radius, x + inset, y + height - radius, stroke, 1);
          this.line(x + width - inset, y + radius, x + width - inset, y + height - radius, stroke, 1);
        }
      }
    },
    line(x1, y1, x2, y2, color, width) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
      const radius = width / 2;
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        for (let yy = Math.floor(y - radius); yy <= Math.ceil(y + radius); yy += 1) {
          for (let xx = Math.floor(x - radius); xx <= Math.ceil(x + radius); xx += 1) {
            if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) <= radius) {
              paintPixel(pixels, size, xx, yy, color);
            }
          }
        }
      }
    },
  };
}

function paintPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const index = (Math.floor(y) * size + Math.floor(x)) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
}

function roundedRectContains(px, py, x, y, width, height, radius) {
  const rx = Math.max(x + radius, Math.min(px, x + width - radius));
  const ry = Math.max(y + radius, Math.min(py, y + height - radius));
  return Math.hypot(px - rx, py - ry) <= radius || (px >= x + radius && px <= x + width - radius && py >= y && py <= y + height) || (py >= y + radius && py <= y + height - radius && px >= x && px <= x + width);
}

function encodePng(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([u32(data.length), typeBuffer, data, u32(crc32(crcInput))]);
}

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(images.length * 16);
  let offset = 6 + directory.length;
  const payloads = [];

  images.forEach((image, index) => {
    const entry = index * 16;
    directory[entry] = image.size >= 256 ? 0 : image.size;
    directory[entry + 1] = image.size >= 256 ? 0 : image.size;
    directory[entry + 2] = 0;
    directory[entry + 3] = 0;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
    payloads.push(image.png);
  });

  return Buffer.concat([header, directory, ...payloads]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function mix(a, b, t) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

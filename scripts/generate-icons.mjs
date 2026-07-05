import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const brandDir = join(process.cwd(), "assets", "brand");
const buildDir = join(process.cwd(), "build");
const sourcePath = join(brandDir, "icon-source.png");

await mkdir(brandDir, { recursive: true });
await mkdir(buildDir, { recursive: true });

if (!existsSync(sourcePath)) {
  throw new Error(`Icon source is missing: ${sourcePath}`);
}

await writeFile(
  join(brandDir, "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Suwol Audio Reference icon">
  <image href="icon-source.png" width="512" height="512" preserveAspectRatio="xMidYMid meet"/>
</svg>
`,
  "utf8",
);

const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
const script = String.raw`
$ErrorActionPreference = "Stop"
$Source = $args[0]
$BrandDir = $args[1]
$BuildDir = $args[2]

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($Source)
$sizes = @(16, 32, 48, 64, 128, 256, 512)
$pngEntries = @()

try {
  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.DrawImage($src, 0, 0, $size, $size)
      $outPath = Join-Path $BrandDir "icon-$size.png"
      $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
      $bytes = [System.IO.File]::ReadAllBytes($outPath)
      $pngEntries += [PSCustomObject]@{ Size = $size; Bytes = $bytes }
      if ($size -eq 512) {
        [System.IO.File]::WriteAllBytes((Join-Path $BuildDir "icon.png"), $bytes)
      }
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }

  $icoEntries = $pngEntries | Where-Object { $_.Size -in @(16, 32, 48, 64, 128, 256) }
  $stream = [System.IO.File]::Open((Join-Path $BuildDir "icon.ico"), [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  $writer = New-Object System.IO.BinaryWriter($stream)
  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$icoEntries.Count)
    $offset = 6 + (16 * $icoEntries.Count)
    foreach ($entry in $icoEntries) {
      $dimension = if ($entry.Size -ge 256) { 0 } else { $entry.Size }
      $writer.Write([Byte]$dimension)
      $writer.Write([Byte]$dimension)
      $writer.Write([Byte]0)
      $writer.Write([Byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$entry.Bytes.Length)
      $writer.Write([UInt32]$offset)
      $offset += $entry.Bytes.Length
    }
    foreach ($entry in $icoEntries) {
      $writer.Write($entry.Bytes)
    }
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
} finally {
  $src.Dispose()
}
`;

const tempScriptPath = join(tmpdir(), `suwol-generate-icons-${process.pid}-${randomUUID()}.ps1`);
await writeFile(tempScriptPath, script, "utf8");

const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tempScriptPath, sourcePath, brandDir, buildDir], {
  stdio: "inherit",
});
await rm(tempScriptPath, { force: true });

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`Icon generation failed with exit code ${result.status ?? "unknown"}.`);
}

console.log("icons generated from assets/brand/icon-source.png");

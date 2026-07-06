# Suwol Audio Reference 0.1.3

## Summary

Suwol Audio Reference 0.1.3 is a release-flow recovery and Linux AppImage auto-update readiness release.

This release keeps the failed `v0.1.2` tag untouched and republishes the current `main` state as `v0.1.3` with fixed Linux updater artifact checks.

## Highlights

- Keeps the Linux AppImage-only auto-update policy.
- Keeps Windows zip and Linux tar.gz as manual-update builds.
- Fixes Linux updater artifact validation for AppImage filenames in `latest-linux.yml`, including URL-encoded AppImage paths.
- Requires `latest-linux.yml` to match the package version and include AppImage sha512 metadata.
- Requires the generated AppImage blockmap to be present for Linux update metadata.
- Preserves the signed checksum release flow.
- Includes the Game Project, Sound Usage Board, Project Sound Pack, Snapshot, Change Review, Release Gate, and Update/Release Status Dashboard features already present on `main`.
- Keeps Project Manifest, Project Missing Report, Project Codex Instruction, Export Center game-project source, and Local export history workflows from the current main branch.

## Distribution

- Windows x64 zip: `Suwol.Audio.Reference.0.1.3.Windows.x64.zip`
- Linux x64 zip: `Suwol.Audio.Reference.0.1.3.Linux.x64.zip`
- Linux x64 AppImage: `Suwol Audio Reference-0.1.3.AppImage`
- Linux x64 tar.gz: `suwol-audio-reference-0.1.3.tar.gz`
- Linux update metadata: `latest-linux.yml`
- AppImage blockmap: `Suwol Audio Reference-0.1.3.AppImage.blockmap`
- Zip checksums: `SHA256SUMS.txt`
- Linux checksums: `checksums.txt`
- Signed Linux checksums: `checksums.txt.asc`
- Release public key: `suwol-release-public-key.asc`

## Linux Auto Update Note

`v0.1.3` is the next valid release after the failed `v0.1.2` tag workflow.

Linux AppImage automatic updates are only detected when the latest GitHub Release version is higher than the running AppImage version.

Examples:

- Running a 0.1.2 AppImage with latest 0.1.3 Release: update can be detected.
- Running a 0.1.3 AppImage with latest 0.1.3 Release: no update is expected.

## Verification

The local release gate for 0.1.3 includes:

```bash
npm.cmd run typecheck
npm.cmd run check:i18n
npm.cmd test
npm.cmd run audit
npm.cmd run build
npm.cmd run smoke:production-entry
npm.cmd run dist:win:dir
npm.cmd run smoke:packaged-paths
npm.cmd run zip:win
npm.cmd run checksums
npm.cmd run check:release -- --platform win
npm.cmd run check:release -- --platform win --require-checksums
npm.cmd run check:release-tag -- --tag=v0.1.3
npm.cmd run check:linux-updater
git diff --check
```

The automated test suite contains 121 tests passed in the current release gate.

## Known Limitations

- Windows zip does not auto-update.
- Linux tar.gz does not auto-update.
- Linux zip does not auto-update.
- No code signing.
- No audio editing or conversion.
- No bundled ffmpeg.
- No AI, cloud analysis, or OpenAI/Codex API calls.
- Existing `v0.1.1` and `v0.1.2` tags and releases are not moved, deleted, or regenerated.

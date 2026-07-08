# Suwol Audio Reference 0.1.4

## Summary

0.1.4 introduces the unified Windows, Linux, and macOS release workflow for Suwol Audio Reference.

This release keeps previous failed `v0.1.2` and `v0.1.3` tags untouched and publishes the current main state with the SuwolView-style release pipeline.

## Highlights

- Windows ZIP release artifact.
- Linux ZIP release artifact.
- Linux AppImage release artifact.
- Linux AppImage auto-update metadata `latest-linux.yml`.
- macOS arm64 DMG and ZIP artifacts.
- macOS `latest-mac.yml` update metadata.
- GPG-signed checksums.
- Public release verification key.
- Unified GitHub Release publish job.
- Manual `workflow_dispatch` recovery with `release_tag`.

## Release Assets

- `SuwolAudioReference-0.1.4-win-x64.zip`
- `SuwolAudioReference-0.1.4-linux-x64.zip`
- `SuwolAudioReference-0.1.4-linux-x64.AppImage`
- `latest-linux.yml`
- `SuwolAudioReference-0.1.4-mac-arm64.dmg`
- `SuwolAudioReference-0.1.4-mac-arm64.zip`
- `latest-mac.yml`
- `checksums.txt`
- `checksums.txt.asc`
- `SuwolAudioReference-0.1.4-checksums.txt`
- `SuwolAudioReference-0.1.4-checksums.txt.asc`
- `suwol-release-public-key.asc`

## Linux Auto Update

Linux auto update is supported only for the AppImage build.

The release must include:

- Linux AppImage.
- `latest-linux.yml`.
- Matching version metadata.

The ZIP build is a manual-update build.

## macOS

macOS artifacts are signed and notarized when the required Apple credentials are available in organization secrets.

The release includes:

- `SuwolAudioReference-0.1.4-mac-arm64.dmg`
- `SuwolAudioReference-0.1.4-mac-arm64.zip`
- `latest-mac.yml`

## Known Limitations

- Windows ZIP does not auto-update.
- Linux ZIP does not auto-update.
- No Windows code signing.
- Existing failed `v0.1.2` and `v0.1.3` tags are not modified.

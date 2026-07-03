# Suwol Audio Reference 0.1.1

## Summary

Suwol Audio Reference 0.1.1 is a packaging hotfix release for the first public zip build. It fixes a blank packaged-app window caused by renderer asset paths that were valid in dev/build smoke but invalid under Electron `file://` loading.

## Changes Since 0.1.0

- Fixed packaged renderer asset paths by building renderer assets with relative `./assets/...` URLs.
- Strengthened production smoke checks so absolute `/assets/...` paths fail before packaging.
- Kept the Windows/Linux zip-first GitHub Actions release flow.
- Kept the release tag guard: `v0.1.1` must match `package.json` version `0.1.1`.

## Supported Artifacts

- `Suwol Audio Reference 0.1.1 Windows x64.zip`
- `Suwol Audio Reference 0.1.1 Linux x64.zip`

## Verification

Record the exact output and date for each release candidate:

```bash
npm.cmd run check:release-tag -- --tag=v0.1.1
npm.cmd run typecheck
npm.cmd run check:i18n
npm.cmd test
npm.cmd run audit
npm.cmd run build
npm.cmd run smoke:production-entry
npm.cmd run dist:win:dir
npm.cmd run smoke:packaged-paths
npm.cmd run zip:win
npm.cmd run check:release -- --platform win
```

The Linux zip is verified in GitHub Actions with `npm run dist:linux:dir`, `npm run zip:linux`, and `npm run check:release -- --platform linux`.

## Known Limitations

The known limitations from 0.1.0 still apply:

- No audio editing.
- No audio conversion or transcoding.
- No bundled app-managed ffmpeg executable.
- No AI, Whisper, LLM, OpenAI, Codex API, or cloud analysis.
- No automatic license judgment.
- No cloud backup or sync.
- Playback support depends on Chromium and the operating system.
- Unsigned Windows builds may show SmartScreen or unknown publisher warnings.

# Suwol Audio Reference Release Checklist

This checklist is for preparing an MVP Windows release candidate. The MVP should remain focused on local library management, local analysis suggestions, localization, diagnostics, and Windows packaging stability.

## Scope Lock

- No new feature work is included after the release branch is cut.
- Only release blockers, QA fixes, packaging fixes, and documentation fixes are accepted.
- Known limitations are recorded in the release notes.

## Version And Metadata

- `package.json` version is correct.
- `package.json` `productName`, `appId`, `description`, and `license` are correct.
- `README.md` reflects the supported platform, formats, library layout, and backup method.
- `docs/manual-qa.md`, `docs/release-notes-0.1.1.md`, `docs/known-issues.md`, and `docs/windows-distribution.md` are present.
- `LICENSE` is present.
- `THIRD_PARTY_NOTICES.md` is present and reviewed against the final lockfile.
- Generated icons exist under `assets/brand/` and `build/`.

## Build Verification

Run from a clean checkout with dependencies installed:

```bash
npm.cmd run icons:generate
npm.cmd run typecheck
npm.cmd test
npm.cmd audit
npm.cmd run check:i18n
npm.cmd run build
npm.cmd run smoke:production-entry
npm.cmd run pack
npm.cmd run smoke:packaged-paths
```

For a Windows zip release, also run:

```bash
npm.cmd run dist:win:dir
npm.cmd run zip:win
npm.cmd run check:release -- --platform win
```

For Linux, confirm the GitHub Actions Linux job runs:

```bash
npm run dist:linux:dir
npm run zip:linux
npm run check:release -- --platform linux
```

## Manual QA

- Complete `docs/qa-checklist.md` on the unpacked build.
- Complete `docs/manual-qa.md` on the unpacked build.
- Complete a short smoke pass on the extracted Windows zip.
- Complete a short smoke pass on the extracted Linux zip when a Linux test machine is available.
- Confirm a second app launch focuses/restores the existing window and does not leave two main windows open.
- Confirm Korean and English are both usable.
- Confirm app launch, library create/open, import WAV/MP3/OGG, corrupted-file import, playback, analysis, similar sounds, diagnostics, backup, Export Center, trash/restore, restart, and reopen flows work in the packaged build.
- Confirm logs can be opened from Settings and renderer fallback errors do not show raw stacks in the UI.
- Confirm adding a future language is documented and `check:i18n` passes.

## Artifact Review

- `release\win-unpacked\Suwol Audio Reference.exe` launches.
- `release\win-unpacked\resources` contains the packaged app resources.
- The Windows zip artifact is present when `npm.cmd run zip:win` is used.
- The Linux zip artifact is present in the GitHub Actions Linux job.
- `npm.cmd run smoke:packaged-paths` passes after `pack` and again after `dist`.
- `npm.cmd run check:release` passes after final artifacts are produced.
- Release artifacts do not include source-only temporary files.
- Release artifacts do not include generated QA fixture audio.
- If `electron-builder` prints `duplicate dependency references`, record it as informational when pack/dist/smoke pass.

## Release Notes

Include:

- Version and commit hash.
- Supported OS.
- Main MVP capabilities.
- Known limitations.
- Verification command results.
- Manual QA result and tester.
- Third-party notice review status.
- Known build notes, including any informational electron-builder warnings.
- Unsigned Windows distribution guidance and hash publication plan.

## GitHub Release Tags

- Main branch pushes create Windows/Linux zip workflow artifacts.
- Release tags use the `vX.Y.Z` format, for example `v0.1.1`.
- The tag must match `package.json` version exactly, with a leading `v`.
- `npm run check:release-tag -- --tag=vX.Y.Z` must pass before pushing a release tag.
- Tag pushes create a GitHub Release and upload Windows/Linux zip assets.
- Before creating a tag, confirm `package.json` version and the matching `docs/release-notes-X.Y.Z.md` file exist.
- Do not tag from an unverified working tree.

Release command:

```bash
git tag v0.1.1
git push origin v0.1.1
```

## Post-Release

- If the project is under version control, the release owner may tag the verified commit outside this stabilization task.
- Archive release artifacts outside the repository.
- Keep the generated Windows/Linux zip checksums with the release notes.

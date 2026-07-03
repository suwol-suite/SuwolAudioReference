# Known Issues

This document lists known limitations and release notes for Suwol Audio Reference 0.1.1. These items should not block the MVP when the documented workaround is acceptable and the automated release gates pass.

## Unsigned Windows App Warning

- Symptom: Windows SmartScreen, Microsoft Defender, or browsers may show an unknown publisher warning.
- Impact: Testers may need extra confidence before running the Windows or Linux zip build.
- Temporary handling: Publish hashes, release notes, license, third-party notices, and artifact source information. Ask testers to verify the source and hash before running.
- Future plan: Evaluate OV or EV code signing in a later release phase.

## Electron Builder Duplicate Dependency References

- Symptom: `electron-builder` may print duplicate dependency reference warnings for packages such as `react` or `loose-envify`.
- Impact: The warning is noisy but has not blocked packaging when `pack`, `dist`, and smoke checks pass.
- Temporary handling: Record the warning in release notes if it appears.
- Future plan: Revisit package metadata cleanup if the warning changes into a build failure or affects packaged output.

## Duplicate GUI Window History

- Symptom: A prior manual GUI smoke attempt produced two windows.
- Impact: Manual QA could be confusing if multiple app starts are launched at once.
- Temporary handling: The app now uses `app.requestSingleInstanceLock()`. During QA, launch one GUI command at a time and confirm a second launch focuses the existing window.
- Future plan: Add deeper automated GUI smoke only when it can run without creating multiple interactive windows.

## Unsupported Playback Codecs

- Symptom: Some imported files may appear as assets but fail playback if Chromium or the OS cannot decode them.
- Impact: The asset can still be organized, diagnosed, or exported, but playback controls may show an unsupported state.
- Temporary handling: Use diagnostics and the Unplayable smart folder to find these files.
- Future plan: Consider clearer codec reporting without adding conversion or ffmpeg features.

## Large Library Performance Expectations

- Symptom: Very large libraries can take longer to import, analyze, search, or export.
- Impact: Long-running operations may require patience, especially on slower disks.
- Temporary handling: Use paged browsing, Load More, smart folders, and diagnostics. Avoid selecting the entire library unless needed.
- Future plan: Continue profiling pagination, analysis queue behavior, and export previews with 1,000+ file fixture sets.

## Missing Files In Link Mode

- Symptom: Link-mode assets become missing when the original file is moved, renamed, deleted outside the app, or stored on a disconnected drive.
- Impact: Playback and export may fail until the source is restored or relinked.
- Temporary handling: Use diagnostics, missing-file views, and relink tools. Link-mode permanent delete never deletes the original source file.
- Future plan: Improve relink suggestions and drive availability messaging.

## No Automatic License Judgment

- Symptom: The app stores source/license/credit fields but does not determine whether an asset is legally usable.
- Impact: Export warnings can help review metadata, but they are not legal advice.
- Temporary handling: Review asset licenses manually before shipping a game or public project.
- Future plan: Add better metadata templates without making legal determinations.

## No Cloud Backup Or Sync

- Symptom: Libraries are local folders and SQLite files only.
- Impact: Data is not backed up unless the user copies or backs up the library folder.
- Temporary handling: Use the library backup workflow or copy the entire library root, including `.suwol-audio`.
- Future plan: Keep cloud backup out of the MVP unless a later phase explicitly scopes it.

## No Audio Editing Or Conversion

- Symptom: The app does not trim, normalize, transcode, convert, or edit audio.
- Impact: Exported sound packs copy original audio files as-is.
- Temporary handling: Use separate audio tools for editing or conversion before importing or after export.
- Future plan: Keep editing/conversion out of this MVP to avoid changing source files or adding ffmpeg/GPL dependencies.

## No Automatic Duplicate Deletion

- Symptom: Duplicate manager can identify duplicate content hashes, but it does not permanently delete duplicates automatically.
- Impact: Cleanup requires explicit user action and a trash step.
- Temporary handling: Move duplicates to trash first, review, then permanently delete only safe copy-mode library-owned files.
- Future plan: Preserve this safety-first flow unless a future release adds stronger review tooling.

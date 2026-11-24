---
name: release-notes
description: Draft user-facing release notes for Pocket Notes from the merged board rows. Use when the user says "write the release notes", "what changed in this version", "changelog for the store listing", or "summarise the release".
argument-hint: "<version>"
---

# release-notes: what changed, in plain words

1. List the rows in `pocket-notes` with stage `merged` since the last release.
2. Group them as **New**, **Better** and **Fixed**. One short line each, no ticket numbers.
3. Follow the tone rules in `references/tone.md`.
4. Write the result to `docs/release-notes-<version>.md` and add a `copy` line to the row.

Done when the notes are in the file and the row's next step says "paste into the store listing".

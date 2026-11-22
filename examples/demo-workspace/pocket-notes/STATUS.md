---
title: Pocket Notes
area: Product
kind: app
health: amber
phase: Beta 0.4
updated: 2026-11-18
summary: A small offline-first notes app. Search and sync are in progress; the 0.4 beta ships once sync conflicts are handled.
now: PN-3
rules: docs/conventions.md
---

## Waiting on you
- Decide the conflict rule for edits made on two devices (last write wins, or keep both) - blocks PN-3 - by 2026-11-25

## Now
- PN-3: sync conflict handling (design agreed, tests being written)
- PN-5: full-text search index

## Next
- PN-6: export to Markdown
- Cut the 0.4 beta once PN-3 is merged

## Board
| ID | Item | Stage | Status | Next step | Date | Note |
|---|---|---|---|---|---|---|
| PN-3 | Sync conflict handling | test | waiting | Needs the conflict rule decision | 2026-11-25 | See [the plan](docs/sync-plan.md) |
| PN-5 | Full-text search index | build | doing | Wire the index into the search bar | — | |
| PN-6 | Export to Markdown | plan | todo | Write the format spec | — | |
| PN-1 | Local storage layer | released | done | — | 2026-10-30 | Shipped in 0.3 |
| PN-2 | Dark theme | merged | done | — | 2026-11-09 | |

## Items
### PN-3 - Sync conflict handling
- doc: Sync plan | docs/sync-plan.md
- doc: Conventions | docs/conventions.md
- url: Pull request | https://example.org/pocket-notes/pulls/42
- cmd: Run sync tests | npm test -- sync
- copy: Branch name | feature/sync-conflicts
Two devices can edit the same note offline. The plan keeps both versions and asks the user, unless the rule below says otherwise.

### PN-5 - Full-text search index
- doc: Search notes | docs/search-notes.md
- cmd: Rebuild the index | npm run index
The index is rebuilt on app start and updated on every save.

## Done recently
- 2026-11-09 PN-2 Dark theme merged
- 2026-10-30 PN-1 Local storage layer released in 0.3

## Links
- [Sync plan](docs/sync-plan.md)
- [Conventions](docs/conventions.md)

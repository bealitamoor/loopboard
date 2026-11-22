# STATUS.md format

One workstream = one `STATUS.md` in the workstream's root folder. It is plain Markdown that you can read and edit
by hand (except the Board rows, see below). `loopboard build --check` fails on format errors; `loopboard doctor` prints fixes.

A folder with two separate streams of work (say app development and SEO) gets two folders and two files.

## Frontmatter

Flat `key: value` lines between `---` fences. No nesting.

```
---
title: Acme Web App
area: Work                 # sidebar group (see "areas" in loopboard.config.json)
kind: app                  # picks the stages, see the kinds table
health: amber              # green | amber | red | paused
phase: Beta, week 3        # one short phrase
updated: 2026-01-15        # YYYY-MM-DD, set at the end of every session that changed something
summary: One sentence on what this is and where it stands.
now: T04                   # optional: board ID shown in the "Now working on" banner
rules: ../RULES.md         # optional: rules file shown in the Rules tab (relative path)
---
```

| key | required | meaning |
|---|---|---|
| `title` | yes | name in the sidebar and page header |
| `area` | yes | sidebar group; unknown areas are listed last |
| `kind` | yes | stage set for the Board (kinds table below) |
| `health` | yes | `green` on track, `amber` slipping or waiting on you, `red` blocked, `paused` parked on purpose |
| `phase` | no | one short phrase |
| `updated` | yes | date of the last real update |
| `summary` | yes | one sentence |
| `now` | no | board ID of the row being worked on right now |
| `rules` | no | relative path to a rules file |

## Body: the sections, in this order

```
## Waiting on you     bullets: action, why, by when. Empty section = "- nothing".
## Now                what is in progress right now (1 to 5 bullets)
## Next               what comes after (1 to 5 bullets)
## Board              the one table (below)
## Items              optional detail page per board row (below)
## Done recently      the last 5 finished things, newest first, with dates
## Links              [label](relative/path) to plans, docs, live URLs
```

Keep it short and current. History belongs in git and in your own docs. Never put secrets, tokens, passwords or
personal data in it; name the path where a secret lives instead.

## Board

One table, the same columns for every kind:

```
| ID | Item | Stage | Status | Next step | Date | Note |
|---|---|---|---|---|---|---|
| T01 | Login screen | build | doing | Wire up the form | 2026-01-20 | |
```

Extra columns may follow `Note` (for example `Cluster`, `Length`, `Channel`); they are shown as they are.
One row per unit of work: a ticket, a post, an article, a design. Keep the board to what is live (about 40 rows).

- **ID**: short and unique in the file (`T01`, `P12`, `A03`). `PROJECT` is reserved for the project-level
  discussion and is not a row.
- **Stage**: where the row is. The kind decides the allowed stages and the progress dots.
- **Status** (all kinds): `todo`, `doing`, `waiting` (on the user), `blocked`, `done`. It drives the count buttons.
- **Date**: `YYYY-MM-DD` (due, scheduled or published), or `—`.

**Rows change through the CLI, not by hand.** `loopboard thread set|addrow|rmrow|order` write the Board; the guard hooks
deny hand edits of Board rows so that history stays intact. Prose sections stay freely editable.

```
loopboard thread set <stream> <ID> stage build
loopboard thread set <stream> <ID> status doing
loopboard thread set <stream> <ID> next "Wire up the form"
loopboard thread addrow <stream> <ID> "New item"
loopboard thread order <stream> <ID1> <ID2> ...
```

## Items

Optional. One `### <ID>` block per row, then `- key: value` lines; any other text is notes. Paths are relative to
the folder of the `STATUS.md`. The page reads the real files, so never paste their contents here.

| key | value | the page shows |
|---|---|---|
| `folder` | `videos/013-intro` | file list, newest image or video as the preview, open-folder and editor buttons |
| `play` | `out/final.mp4` | that file as the preview instead of the newest |
| `kit` | `posts/P03.md` | every `## Section` of that file as a copy-ready field |
| `doc` | `Plan \| docs/plan.md` | the file with open, editor, copy-path and reveal buttons |
| `url` | `Live \| https://example.com/post` | a link button |
| `cmd` | `Render \| node scripts/render.mjs 013` | the command with a copy button (runs from the STATUS.md folder) |
| `copy` | `Hashtags \| #a #b` | a short copy-ready text |

Example:

```
### P03
- kit: posts/P03.md
- doc: Image brief | posts/P03-image.md
- url: Published | https://example.com/p/123
```

## Kinds

Each kind is a stage set; the stages are the progress dots on the Board. Add your own in `loopboard.config.json` under
`"kinds": { "name": ["stage1", "stage2"] }`.

| kind | use for | stages, in order |
|---|---|---|
| `app` | software: apps, web, services, scripts | `plan` > `build` > `test` > `review` > `merged` > `released` |
| `pipeline` | content made in repeated steps (videos, episodes) | `idea` > `script` > `assets` > `voice` > `render` > `ready` > `published` |
| `campaign` | dated plans: SEO, launches, growth sprints | `plan` > `draft` > `review` > `published` > `indexed` > `promoted` |
| `research` | investigations, strategy, open questions | `open` > `researching` > `answered` > `decided` |
| `design` | design tasks from brief to ship | `brief` > `explore` > `wireframe` > `visual` > `review` > `handoff` > `shipped` |
| `social` | social posts | `idea` > `draft` > `visual` > `scheduled` > `posted` > `measured` |
| `plan` | a personal planner board | `backlog` > `this-week` > `today` > `done` |

## Threads

Each workstream can have a thread file next to its `STATUS.md` (one JSON object per line). It holds the comments on
rows and on the project (`PROJECT`). Comment kinds: `todo` (instruction for the agent), `blocker`, `question`,
`answer`, `decision` (binding), `note`. `todo`, `blocker` and `question` stay open until resolved. Comments you
write on the page are marked `by: you`; everything an agent writes is `by: agent`, and agents only write through
`loopboard thread add|resolve|reopen`. Do not edit the thread file by hand.

## Validation

```
loopboard build --check     fails on format errors (missing sections, unknown stage for the kind, bad dates)
loopboard doctor            checks Node, config, data directory, port and every STATUS.md; prints fixes
```

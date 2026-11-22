---
name: hub-weekly
description: Weekly review per workstream: what was done this week, what slipped, what is blocked, and the plan for next week, written to reports/week-YYYY-MM-DD.md. Use when the user says "weekly review", "week in review", "what did I get done this week", "weekly report", "plan next week from the hub", or on a Friday wrap-up.
argument-hint: "[stream]  (default: every workstream)"
---

# hub-weekly: the weekly review

CLI: `loopboard <args>` means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. Pick the week: the 7 days up to today. Name the file by today's date.
2. List workstreams (or take the one given):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" list
   ```
3. For each workstream read `STATUS.md` (`## Done recently`, the Board, `## Waiting on you`) and, if it is inside a
   git repository, `git log --since="7 days ago" --oneline -- <workstream folder>` to confirm what really shipped.
   Use `loopboard thread show <stream> PROJECT` for decisions made this week.
4. Write `reports/week-YYYY-MM-DD.md` (create `reports/` next to `loopboard.config.json` if missing) with the editor
   tool. One block per workstream:
   ```
   ## <workstream title> (<health>)
   Done: <rows and things finished this week, with IDs and dates>
   Slipped: <rows whose Date passed or that stayed in one stage all week, and why if known>
   Blocked / waiting: <row, who or what it waits on>
   Next week: <3 to 5 concrete next steps, top priority first>
   ```
   Numbers come from the files; anything you cannot count is written `[fill: <what is missing>]`.
5. Suggest changes to the board (reorder, new rows, rows to drop) and ask before applying them. After a yes, use
   `loopboard thread order`, `addrow`, `rmrow` or `set`. Then:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" build --check
   ```
6. Tell the user the report path as a link and the three most important points.

## Done when

`reports/week-YYYY-MM-DD.md` exists with one block per workstream, gaps are marked `[fill: ...]`, and any board
change the user approved is applied through the CLI.

## Never

- Invent progress, counts or dates; mark the gap instead.
- Change board rows without the user's yes.
- Overwrite an earlier report; each week gets its own file.
- Put secrets or personal data in the report.

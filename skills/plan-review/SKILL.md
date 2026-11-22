---
name: plan-review
description: Review the day or the week of a planner board: mark what is done, move unfinished rows back with a reason, and note what to carry or drop (kind plan). Use when the user says "review my day", "end of day review", "what did I finish", "weekly planning review", "close out today", or "what slipped".
argument-hint: "[day|week] [stream]"
---

# plan-review: close the loop

Default scope is today; with `week`, the whole `this-week` and `done` set. The user tells you what is finished; you
do not guess from silence.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **List the rows in scope**: stage `today` (or `today` and `this-week` for a week) in the planner board.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
2. **Ask once, as a list:** for each row, done, partly done, or not touched? and for partly done, what is left.
   Offer a default guess from git history or file changes as a suggestion the user can correct, never as fact.
3. **Apply the answers.**
   Finished:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage done
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status done
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> date <YYYY-MM-DD>
   ```
   Unfinished (back to the week, or to the backlog if the week is over):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage this-week
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status todo
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "<what is left>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> note "slipped: <one-line reason>"
   ```
   Blocked by someone: status `blocked` or `waiting`, with a thread comment saying on whom:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> blocker "<what blocks it and how to unblock>" --no-build
   ```
4. **Spot patterns** (week scope): rows that slipped twice, rows with no next step, estimates that are always too
   small. Offer one change to try next week; do not lecture.
5. **Prose** (editor tool): `## Done recently` (last 5, newest first, dated), `## Now`, `## Next`, `updated:` =
   today. Then `loopboard build --check`.
6. Tell the user: done count, what slipped and why, and the suggestion for tomorrow or next week. Offer
   `plan-today` or `plan-week` next.

## Done when

Every in-scope row is either `done` or back in a planned stage with a reason, `## Done recently` is current, and
`loopboard build --check` passes.

## Never

- Mark a row done without the user saying it is done.
- Delete a slipped row; move it and note why.
- Count hours or percentages you did not get from the user.
- Edit board rows or the thread file by hand; use `loopboard thread`.

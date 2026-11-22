---
name: plan-week
description: Plan the week from the backlog: pick the rows that go into this week within the user's real capacity, order them by priority, and set their stage (kind plan). Use when the user says "plan my week", "what goes in this week", "weekly planning", "pick this week's tasks", "prioritise my backlog", or "sort the backlog".
argument-hint: "[stream]  (default: the plan workstream)"
---

# plan-week: choose what fits

Stages for kind `plan`: `backlog` then `this-week` then `today` then `done`. This skill moves rows from `backlog`
to `this-week` and sets the order (top = priority).

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Load the board.** Find the planner workstream (`loopboard list`; kind `plan`) and read its `STATUS.md`. Also run
   `loopboard thread open` for comments that change priorities (a `decision` overrides the board).
   Rows still in `this-week` from last week are carry-over: decide each first (keep, push back, or drop).
2. **Ask for capacity in one message**: working days and hours available, fixed meetings or deadlines this week,
   and the one outcome that would make the week a success. Do not assume hours.
3. **Propose, do not apply.** Show a table of candidates: `ID | item | why now (deadline, blocker for others,
   quick win) | rough size [fill if unknown]`. Pick a set that fits the capacity with slack (about 70 percent of
   stated hours, and at most 7 rows). Rows that wait on someone else go in a separate "chasing" list. Say what you
   left out and why.
4. **After the user's yes (or edits), apply:**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage this-week
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status todo
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "<first concrete step>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread order <stream> <ID1> <ID2> <ID3> ...
   ```
   Put deadlines in the Date column:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> date <YYYY-MM-DD>
   ```
   Push back what was dropped: `loopboard thread set <stream> <ID> stage backlog`.
5. **Update the prose** (editor tool): `## Now` = the week's outcome and top 3 rows, `## Next` = what follows,
   `## Waiting on you` = decisions you need, `updated:` = today. Then:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" build --check
   ```
6. Tell the user the week in one short list, with the first thing to do on Monday.

## Done when

The chosen rows are at `this-week` in priority order with a next step, the dropped ones are back in `backlog`, the
prose sections match, and the user agreed to the set.

## Never

- Apply the plan before the user confirms it; planning is theirs.
- Fill the week to 100 percent or invent sizes; use `[fill]`.
- Delete rows to tidy up; push them to `backlog` unless the user says to remove them.
- Edit board rows or the thread file by hand; use `loopboard thread`.

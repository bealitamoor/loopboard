---
name: plan-today
description: Choose the top 3 things for today from this week's rows, order them, and set them to stage today (kind plan). Use when the user says "plan my day", "what are my top 3 today", "what should I work on now", "start my day", "today's focus", or "pick today's tasks".
argument-hint: "[stream]"
---

# plan-today: three things

Three is the limit. A day with ten priorities has none.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Read the state.**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" list
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread open
   ```
   In the planner workstream's Board, collect rows at `today` (carry-over), then `this-week`. Check each row's Date,
   status and thread for blockers.
2. **Rank** using, in order: a due date of today or earlier; something other people are waiting on; the week's
   stated outcome (`## Now`); the next step that unblocks the most. Skip rows whose status is `waiting` or
   `blocked` and name them as "chasing", with who or what they wait on.
3. **Ask one question**: how much time is realistically free today and what is fixed. If the user already said,
   use it.
4. **Propose exactly 3 rows** (fewer if time is short), each with the first 30 to 60 minute step, and one line
   for what "done today" means. Wait for the user's OK or swap.
5. **Apply:**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage today
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status doing
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "<today's concrete step>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread order <stream> <ID1> <ID2> <ID3> ...
   ```
   Rows from yesterday that you did not choose go back: `loopboard thread set <stream> <ID> stage this-week`.
6. **Prose** (editor tool): `## Now` = the three, one line each; `## Waiting on you` = anything you need decided
   today; `updated:` = today. Then `loopboard build --check`.
7. Say in chat: the three, the first step of the first one, and what you are chasing.

## Done when

Exactly the agreed rows (3 at most) are at `today` in order with a concrete next step, the rest are back at
`this-week`, and the user has the list.

## Never

- Put more than 3 rows at `today`.
- Pick `waiting` or `blocked` rows as work for today.
- Apply before the user agrees.
- Mark anything `done` that the user did not say is done.
- Edit board rows or the thread file by hand; use `loopboard thread`.

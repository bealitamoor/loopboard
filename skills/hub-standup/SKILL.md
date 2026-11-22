---
name: hub-standup
description: Daily standup across all workstreams: what is waiting on the user, what is in progress, what is blocked, what is due today, and which hub comments are open. Read-only. Use when the user says "standup", "what is on my plate", "what is waiting on me", "morning summary", "what should I do today", or "daily check-in".
---

# hub-standup: the daily view

Read-only. You summarize; you change nothing unless the user then asks.

CLI: `loopboard <args>` means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. Overview of every workstream (health, waiting count, open comments):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" list
   ```
2. All open comments (instructions, blockers, questions):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread open
   ```
3. For each workstream with health amber or red, a waiting count above 0 or open comments, read its `STATUS.md`
   sections `## Waiting on you` and `## Now` and the Board rows whose Status is `doing`, `waiting` or `blocked`,
   or whose Date is today or earlier.
4. Answer in chat, in this order, each as a short list with the workstream and row ID:
   - **Waiting on you**: action, why, by when. Overdue first.
   - **Due today or overdue**: rows with a Date of today or earlier that are not `done`.
   - **In progress**: rows with status `doing`.
   - **Blocked**: row, blocker, the unblock idea if the thread has one.
   - **Open comments for the agent**: count per workstream; offer `/loopboard:hub-work inbox`.
5. Close with one suggested first move, in one sentence.

## Done when

The user has the groups above (skip empty ones, say "nothing" once) and a suggested first move.

## Never

- Edit any file or run a write command.
- Invent a due date or a status; if a field is `—`, say it has no date.
- Pad the answer with workstreams that have nothing to report.

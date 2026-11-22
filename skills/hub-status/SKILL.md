---
name: hub-status
description: Update the STATUS.md of every workstream the session touched, at the end of a work session: Waiting on you, Now, Next, Done recently, the updated date, and board rows. Use when the user says "update the status", "wrap up", "end of session", "log what we did", "update the hub", or when the Stop hook says a workstream's STATUS.md is out of date.
---

# hub-status: end-of-session update

Keep `STATUS.md` a short picture of the current state, not a history. History belongs in git and the project's own
docs.

CLI: `loopboard <args>` means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. Find the workstreams the session touched: `git status` / recent changes, plus the folders you worked in.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" list
   ```
   Each touched workstream has a `STATUS.md` in its root folder.
2. For each one, read its `STATUS.md` and run `loopboard thread open <stream>` (open comments are the user's task list).
3. Rows first, through the CLI only:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage <stage>
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status <todo|doing|waiting|blocked|done>
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "<next concrete step>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> date <YYYY-MM-DD>
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread addrow <stream> <ID> "<new item>"
   ```
   Finished work: status `done`. Anything that needs the user: status `waiting`.
4. Prose sections with the editor tool (never by shell redirection):
   - frontmatter: `updated:` = today, `health:` (green on track, amber slipping or waiting on the user, red
     blocked, paused parked on purpose), `phase:`, `summary:`, `now:`.
   - `## Waiting on you`: only things that truly wait on the user, as `action, why, by when`. Empty = `- nothing`.
   - `## Now` (1 to 5 bullets), `## Next` (1 to 5).
   - `## Done recently`: last 5 finished things, newest first, with dates. Drop older ones.
   - `## Items`: add a `### <ID>` block when a row now has files, a PR or a link.
5. Check and rebuild:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" build --check
   ```
   Fix every format error it prints. Then tell the user, in chat, what changed per workstream.

## Done when

Each touched workstream has `updated:` set to today, `## Waiting on you` is accurate, finished rows say `done`,
and `loopboard build --check` passes.

## Never

- Edit `## Board` rows or the thread file by hand, or write to `STATUS.md` from the shell.
- Paste file contents into `## Items`; point at the file instead.
- Write secrets, tokens, passwords or personal data into `STATUS.md`; name the path where a secret lives.
- Keep history in the file; remove stale rows and bullets instead of stacking them.
- Mark something `done` that was not verified.

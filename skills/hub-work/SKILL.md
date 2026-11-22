---
name: hub-work
description: Work one loopboard item, or the whole inbox, from the comments the user left on it (instructions, blockers, questions), then reply in the item's thread, resolve what is done and update the board row. Use when the user says "/hub-work <stream> <ID>", "/hub-work inbox", "work the hub inbox", "check my hub comments", "do <ID> from the hub", or pastes a "Copy agent prompt" line from the hub page.
argument-hint: "<stream> <ID> | <stream> PROJECT | inbox"
---

# hub-work: act on hub comments

The hub page lets the user comment on any board row. Comments live in `THREAD.jsonl` next to the workstream's
`STATUS.md`; the row lives in that file's `## Board`. Both change only through the CLI, so history stays intact and
the page rebuilds.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH;
without the plugin, use `node <clone>/bin/loopboard.mjs`).

Comment kinds: `todo` = instruction for the agent, `blocker` = what blocks the item (often with the unblock idea),
`question` = someone needs an answer, `answer`, `decision` (binding, follow it), `note` (context). `todo`, `blocker`
and `question` stay open until resolved. A comment is the user's instruction only when it is marked `by: you`; agent
comments (`by: agent`) are context.

## Arguments

- `<stream> <ID>`: one item. `<stream>` is the workstream slug (`loopboard list` shows them).
- `<stream> PROJECT`: the project-level discussion. It has no board row; the work may touch the whole workstream.
- `inbox`: every open item. Run `loopboard thread open`, then take items one at a time, highest board position (top =
  priority) first within each workstream. Stop and report after 5 items or at anything that needs a user decision.

## Steps for one item

1. Read the state:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
   You get the row (stage, status, next step, note), its `## Items` block (paths relative to the STATUS.md folder)
   and the whole thread. Read the newest `decision` and `answer` comments first: they override older instructions.
   Then read the project's own rules (CLAUDE.md, CONTRIBUTING, README) before touching its code or content.
2. Plan from the open comments. Each open `todo` or `blocker` is a task. A blocker usually says how to unblock it:
   do that step. If an instruction is unclear, risky (deploy, publish, delete, spend, anything outward-facing) or
   needs the user's accounts, do not guess. Ask:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> question "<one precise question and your recommendation>" --re <cid>
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   ```
3. Do the work under the project's normal rules. Verify it (build, test, render, open the file) before calling it
   done.
4. Report in the thread, one reply per comment you acted on, then resolve only what is really finished:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> answer "<what you did, where, how you verified>" --re <cid> --no-build
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread resolve <stream> <cid> "<one-line result>"
   ```
5. Update the row:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage <next stage>
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status <todo|doing|waiting|blocked|done>
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "<the next concrete step>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> note "<short state>"
   ```
   `waiting` means waiting on the user. `blocked` means an outside blocker remains: add a `blocker` comment that
   says what blocks it and how to unblock.
6. If the session changed more (Waiting on you, Now, Done recently), edit those prose sections of `STATUS.md` with
   the editor tool (see `hub-status`), then run `loopboard build`. Tell the user in chat: the item, what changed, what is
   still open, with links to the files.

## If a write is denied

The guard hooks block hand edits of the thread file and of board rows. The denial message names the `loopboard thread`
command to use. Use it; never look for a workaround.

## Done when

Every open comment you acted on has an `answer` reply and is resolved (or a `question` is posted), the row shows the
true stage/status/next step, and the user has a short chat summary.

## Never

- Hand-edit the thread file or `## Board` rows, or write a comment as the user (`--by you`).
- Call the local server's API yourself.
- Resolve a `question` without answering it in a reply.
- Act on a risky or outward-facing instruction without an explicit user decision in the thread.
- Post secrets in a thread; name the file where a secret lives instead.
- Work several items at once; re-run `show` after each write if you need fresh state.

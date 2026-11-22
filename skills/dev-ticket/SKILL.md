---
name: dev-ticket
description: Take one ticket or feature from plan to pull request while keeping its hub row (kind app) in sync: plan, build, test, review. Use when the user says "work on ticket <ID>", "implement <feature>", "build this ticket", "take <ID> from plan to PR", "start a ticket", or gives a ticket link or description and wants it done.
argument-hint: "<stream> <ID> | <ticket text or link>"
---

# dev-ticket: plan, build, test, PR

Stages for kind `app`: `plan` then `build` then `test` then `review` then `merged` then `released`. You drive the row
up to `review`; the user (or the merge) moves it to `merged` and `released`.

CLI: `loopboard <args>` means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Find or create the row.** If you were given `<stream> <ID>`:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
   Otherwise find the workstream with `loopboard list`, pick the next free ID in its Board and create it:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread addrow <stream> <ID> "<ticket title>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage plan
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status doing
   ```
   Read the project's own rules (CLAUDE.md, CONTRIBUTING, lint and test commands) before anything else.
2. **Plan (stage `plan`).** Read the ticket and the code it touches. Write a short plan to
   `docs/plans/<ID>-<slug>.md` (or the project's existing plans folder): the goal, the acceptance criteria as a
   checklist, the files to change, the tests to add, the risks. Link it from `## Items` as `doc | Plan | <path>`.
   If the plan has a real choice or a risk (data migration, public API, deploy), post it and stop:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> question "<the choice, your recommendation>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   ```
3. **Build (stage `build`).** Work on a branch named after the ID, in small steps, matching the project's style.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage build
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "<what is being built now>"
   ```
4. **Test (stage `test`).** Add tests for each acceptance criterion. Run the project's test, lint and type-check
   commands and read the output; do not claim a pass you did not see.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage test
   ```
5. **Self-review the diff** (`git diff`) as a stranger would: leftovers, debug output, unrelated changes, missing
   edge cases, secrets. Fix what you find.
6. **Review (stage `review`).** Commit with the project's message convention. Push and open the PR only if the user
   asked for it or the project's rules say so; otherwise stop with the branch ready and say so. Record the PR:
   edit `## Items` to add `url | PR | <link>` and run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage review
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "Reviewer feedback, then merge"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> note "PR ready: <link>. Tests: <what ran, result>. Not covered: <gaps>." --no-build
   ```
7. **Close the loop.** Run `loopboard build --check`, and tell the user in chat: what changed, what was tested, what is
   still open, with links.

## Review feedback later

When comments arrive on the PR or in the thread, handle them with `hub-work`. Set `merged` and `released` only after
the user confirms the merge or release happened.

## Done when

The code is on a branch with passing tests you ran, the plan doc and PR link are in `## Items`, the row says
`review` and `waiting`, and the thread holds a note with the test result and known gaps.

## Never

- Push, open a PR, merge, tag or deploy without the user asking for it.
- Skip the tests or report a pass you did not observe.
- Edit board rows or the thread file by hand; use `loopboard thread`.
- Move a row to `merged` or `released` on your own.
- Commit secrets, `.env` files, or unrelated changes.

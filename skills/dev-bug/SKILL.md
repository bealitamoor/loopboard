---
name: dev-bug
description: Fix a bug the disciplined way and keep the hub row in sync: reproduce, find the cause, fix, verify, then record the row and a lesson. Use when the user says "fix this bug", "there is a bug in", "this is broken", "debug <ID>", "reproduce and fix", "investigate this crash", or pastes an error or stack trace.
argument-hint: "<stream> [ID] | <error text or description>"
---

# dev-bug: repro, fix, verify, record

Uses kind `app` stages: `plan` (diagnose), `build` (fix), `test` (verify), `review`.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Row.** Use the given row, or create one with the next free ID (for example `B07`):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread addrow <stream> <ID> "Bug: <short symptom>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage plan
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status doing
   ```
2. **Reproduce first.** Get the failing behaviour on demand: exact steps, input, environment, the error text. If
   you cannot reproduce it, do not fix it; ask:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> question "Cannot reproduce. I tried <steps>. Need: <version, input, log>." 
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   ```
3. **Write a failing test** that captures the bug, when the project has a test setup. Run it and see it fail for
   the right reason.
4. **Find the cause, not the symptom.** Read the code path; form one hypothesis at a time and check it with a log,
   a debugger or a smaller test. Write the root cause in one sentence.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage build
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> note "Cause: <one sentence>"
   ```
5. **Fix** with the smallest change that removes the cause. Look for the same pattern elsewhere and mention it;
   fix those only if the user agrees.
6. **Verify.** The new test passes, the rest of the suite passes, and the original reproduction no longer fails.
   Paste the commands you ran in your report, not guesses.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage test
   ```
7. **Record.** Add an `answer` or `note` to the thread with cause, fix and how it was verified, then move the row:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> note "Cause: <...>. Fix: <...>. Verified: <...>." --no-build
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage review
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   ```
   Open the PR only if the user asked (see `dev-ticket` step 6).
8. **Lesson.** If the bug took real effort or teaches a reusable rule, write one lesson note where the project keeps
   them (check its docs; default `docs/lessons/<readable-title>.md`): a one-line imperative rule at the top, then
   what happened, why it was easy to miss, how to apply it. One lesson per file. Never include secrets or user data.

## Done when

The bug has a reproduction, a root-cause sentence, a passing regression test (or a stated reason there is none), the
row is at `review` with a thread note, and a lesson exists if one was earned.

## Never

- Fix before reproducing, or claim a fix you did not run.
- Disable, skip or loosen a test to make it pass.
- Paste production data, secrets or personal data into the thread, a lesson or a test fixture.
- Hand-edit rows or the thread file; use `loopboard thread`.
- Push or open a PR unasked.

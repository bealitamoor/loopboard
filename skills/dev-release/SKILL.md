---
name: dev-release
description: Prepare a release from the hub: build a ledger of merged rows, draft changelog entries, walk the pre-tag checklist, and, only after the user says yes, tag and mark rows released. Use when the user says "prepare a release", "cut a release", "what is going out in this release", "release checklist", "tag v1.2.0", "write the changelog", or "ship it".
argument-hint: "<stream> [version]"
---

# dev-release: ledger and tag checklist

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Collect what is going out.** Read the workstream's `STATUS.md` Board and list rows at stage `merged` that are
   not yet `released`. Cross-check with git: `git log <last-tag>..HEAD --oneline` (use the latest tag; if there is
   none, say so). Rows with no commit, or commits with no row, go in an "unmatched" list for the user.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
2. **Write the ledger** to `releases/<version>.md` in the workstream folder (create the folder if needed), with the
   editor tool:
   ```
   # <version> (<YYYY-MM-DD, planned>)
   | ID | Item | PR / commit | Tested how | Notes |
   Unmatched: <commits without a row, rows without a commit>
   Risks: <migrations, config changes, flags, rollbacks>
   Rollback: <how to undo>
   ```
   Fill `Tested how` only from evidence you saw; otherwise `[fill: ...]`.
3. **Suggest the version** using the project's scheme (semver by default): breaking change = major, new feature =
   minor, fixes only = patch. State why in one line; the user decides.
4. **Draft the changelog entry** under `## [version] - date` in `CHANGELOG.md` (Added, Changed, Fixed), one plain
   line per change, no marketing words. Show it before saving.
5. **Run the checklist** in [references/release-checklist.md](references/release-checklist.md). Run each command
   yourself where it is safe (tests, build, lint, secret scan) and mark each item pass, fail or `[fill: owner]` for
   steps only the user can do.
6. **Stop and ask.** Post the summary in the thread and set the rows to wait:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> PROJECT note "Release <version> ready: <n> rows, checklist <x/y> green. Waiting for your go to tag." --no-build
   ```
7. **Only after an explicit yes**, tag and publish with the project's own commands (for example
   `git tag -a v<version> -m "<version>"`, then the push or the release job the user names). Then mark each shipped
   row:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage released
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status done
   ```
   Update `## Done recently` and `updated:` as in `hub-status`, then `loopboard build --check`.

## Done when

The ledger and changelog entry exist, the checklist is filled in honestly, and rows are `released` only if the
user confirmed the tag or release happened.

## Never

- Tag, push, publish or deploy without an explicit yes in this conversation.
- Mark a row `released` because it was merged.
- Fill `Tested how` or checklist items from assumption.
- Force-push, rewrite published tags, or skip hooks.
- Edit board rows by hand; use `loopboard thread`.

---
name: hub-setup
description: Onboard a user to loopboard: decide single project vs many, write loopboard.config.json, scan folders for projects, infer each project's kind, create a STATUS.md per workstream from the templates, run loopboard doctor, and offer to keep the server running. Use when the user says "set up loopboard", "set up the hub", "/loopboard:hub-setup", "add this project to the hub", "create a STATUS.md", "scan my workspace for projects", or "the hub is not working".
argument-hint: "[folder]  (default: the current directory)"
---

# hub-setup: first-run onboarding

Goal: a working hub with one correct `STATUS.md` per workstream, in about five minutes, without inventing facts.

CLI: `loopboard <args>` means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH;
without the plugin, use `node <clone>/bin/loopboard.mjs`).

## Steps

1. **Check the basics.** Run `node --version` (need 18 or newer). If a `loopboard.config.json` already exists in this
   folder or above, say so and switch to "add a workstream" (step 5); never overwrite it.
2. **Ask three short questions** (use the user's answers, do not assume):
   - One project or many? One = a single `STATUS.md` at this folder's root. Many = a workspace folder holding
     several projects, each with its own `STATUS.md`.
   - Sidebar areas for grouping (many only). Offer defaults `Work, Content, Lab`; the user may rename them.
   - Which editor opens files from the page: `code`, `cursor`, `zed`, `subl`, `idea` or `none`.
3. **Write the config.**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" init --single
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" init --multi --areas "Work,Content,Lab"
   ```
   `--single` also writes a starter `STATUS.md`. Then set `editor` in `loopboard.config.json` with the editor tool if the
   user chose one other than the default. `init` never overwrites; if it refuses, read the existing file instead.
4. **Scan for projects (many mode, or when a single folder holds sub-projects).** List candidate folders up to two
   levels under each root, skipping the configured `skip` folders. For each, note markers and infer a kind using
   [references/kind-inference.md](references/kind-inference.md). Show the user one table:
   `folder | proposed title | kind | area`, and ask them to correct it. Do not create anything before the yes.
5. **Create the STATUS.md files** from the templates, one command per workstream:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" new <folder> --title "<title>" --kind <kind> --area "<area>"
   ```
   Then fill the file with the editor tool, using only facts you can read: `summary:` from the project's README,
   `phase:`, `## Now` and `## Next` from open TODOs or the user's words, `## Links` to real docs. Where a fact is
   unknown write `[fill: ...]` or leave the template's placeholder. Add real work as board rows:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread addrow <stream> <ID> "<item>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage <stage>
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status todo
   ```
6. **Verify.**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" doctor
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" build --check
   ```
   Fix every problem doctor prints (it names the fix). Re-run until clean. Then `loopboard list` and show the result.
7. **Offer to keep the server running.** Explain in one sentence what it does: it registers a background job so the
   page at `http://localhost:<port>/hub/` is always up (launchd on macOS, a hidden Startup-folder launcher on Windows with no admin rights, a systemd user
   unit on Linux), and `loopboard service remove` undoes it. Ask for an explicit OK. Only after a yes:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" service install
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" service status
   ```
   If the user says no, tell them to run `loopboard serve` when they want the page, then `loopboard open`.
8. **Hand over.** Tell the user in chat: where the config is, the page URL, the first prompt to try
   (`/loopboard:hub-status` at the end of a session, `/loopboard:hub-standup` in the morning, comments on a row
   then `/loopboard:hub-work inbox`), and that the guard hooks keep `## Board` rows and threads CLI-only. Mention
   `"guard": false` in `loopboard.config.json` if they want that off.

## Single project in one line

One `STATUS.md` at the repo root, `loopboard init --single`, pick one kind, `loopboard doctor`. Skip steps 4 and the area
question.

## Done when

`loopboard doctor` and `loopboard build --check` pass, every project the user approved has a `STATUS.md` with truthful content,
`loopboard list` shows them, and the service is installed only if the user said yes.

## Never

- Overwrite an existing `loopboard.config.json` or `STATUS.md`.
- Run `loopboard service install` without the user's OK.
- Invent summaries, phases, dates or rows; use `[fill: ...]`.
- Put secrets, tokens or personal data in any `STATUS.md`.
- Scan outside the folder the user named, or into `node_modules`, `.git` and other skipped folders.
- Create the board by hand; rows are written only through `loopboard thread`.

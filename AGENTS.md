# AGENTS.md: guide for agents working on this repo

This is the source of the `loopboard` plugin: a local dashboard over `STATUS.md` files, plus skills and hooks.
The contract is `docs/SPEC.md`; the file format is `docs/FORMAT.md`. Read those before changing anything.

## Commands

- Run the tests before and after a change: `node --test`
- Run the CLI from the repo: `node bin/loopboard.mjs <command>` (`loopboard doctor`, `loopboard build --check`, `loopboard list`, ...)

## Rules

- **Zero dependencies.** Node 18+ standard library only. No `package.json` dependencies, no build step.
- **No personal data.** Never write real names, emails, tokens, absolute home paths or private project names into
  any file, test fixture or example. Use `example.com`, fictional projects. The privacy test must stay green.
- **Cross-platform.** macOS, Windows, Linux. Build paths with `node:path`; spawn with an argument array; no
  shell-only features in `engine/`.
- **Local only.** The server binds 127.0.0.1 and checks the token, Host and Origin. Do not weaken that.
- **Agents never write as the user.** Agent writes are `by: agent`; only the token-checked page writes `by: you`.
- Do not hand-edit generated output (the built page, caches) or anything in a user's data directory.

## Skills

- One folder per skill under `skills/`, flat. `name` in the frontmatter equals the folder name (a-z, 0-9, hyphen,
  64 characters at most). `description` 1024 characters at most, with "Use when the user says ..." trigger phrases.
- `SKILL.md` body under 300 lines: imperative steps, exact `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" ...` commands,
  a `## Done when` section and a `## Never` list. Long checklists go in `references/`.
- Board rows change only through `loopboard thread set|addrow|rmrow|order`; prose sections are edited with the editor
  tool. A skill never writes a thread comment as the user.
- Social and SEO copy: plain human voice, no AI cliches, `[fill: ...]` instead of invented numbers, 3 to 5 hashtags
  at most, LinkedIn links in the first comment.
- Adding a skill or kind: follow `CONTRIBUTING.md`, update the README table and `CHANGELOG.md`.

## Before you finish

- `node --test` passes.
- No file contains a home path, email or token (grep for them if unsure).
- Docs and the changelog match the change.
- Do not commit, push or tag unless the maintainer asked you to.

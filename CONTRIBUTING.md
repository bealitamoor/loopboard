# Contributing

Thanks for helping. The project has one rule above the others: **no dependencies and no personal data**. Node 18+
standard library only, and nothing from your machine (names, emails, home paths, private project names) in any
file.

## Run the tests

```
node --test
```

This must pass on macOS, Windows and Linux (CI runs all three on Node 18 and 22). Add or update a test for any
change in `engine/`, `bin/` or `hooks/`. `test/no-personal-data.test.mjs` scans the repo for absolute home paths,
emails and tokens; it must stay green.

## Layout

```
.claude-plugin/   plugin.json, marketplace.json
bin/loopboard.mjs       the CLI
engine/           config, build, thread, server, guard, platform
hooks/hooks.json  guard hooks
skills/<name>/    one folder per skill (flat, no nesting)
templates/        STATUS.md per kind, loopboard.config.json example
examples/         a fictional demo workspace
docs/             SPEC.md, FORMAT.md, PLATFORMS.md, SECURITY.md, PUBLISHING.md
test/             node:test suites
```

## Add a skill

1. Create `skills/<name>/SKILL.md`. The folder name equals `name` in the frontmatter: lowercase letters, digits and
   hyphens, 64 characters at most. Use a role prefix (`dev-`, `design-`, `social-`, `plan-`, `seo-`, `hub-`).
2. Frontmatter:
   ```
   ---
   name: <folder name>
   description: <what it does, then "Use when the user says ...", 1024 characters at most>
   argument-hint: "<stream> <ID>"     # optional
   ---
   ```
   The description is how the agent decides to load the skill, so name the real phrases a person would say.
3. Body under 300 lines, in this shape: a one-paragraph purpose; the CLI note (`hub` means
   `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs"`); numbered imperative steps with the exact commands; a
   `## Done when` section; a `## Never` list.
4. Put long checklists, templates and style guides in `skills/<name>/references/*.md` and link them from the body,
   so the skill stays short and the detail loads only when needed.
5. Rules every skill follows:
   - Board rows change only through `loopboard thread set|addrow|rmrow|order`. Prose sections are edited with the editor
     tool. Never write a comment as the user (`--by you`).
   - Anything outward-facing (publish, push, tag, deploy, post) needs the user's explicit yes.
   - Facts are read from files; unknown values are written `[fill: ...]`, never invented.
   - Social and SEO skills: plain human voice, no AI cliches, 3 to 5 hashtags at most, links in the first comment on
     LinkedIn.
   - No real names, emails, paths or project names, even in examples.
6. Check the frontmatter and size (a quick script, or by hand), add the skill to the README table and to
   `CHANGELOG.md`, and run `node --test`.

## Add a kind

A kind is a stage set. Built-in kinds are defined in the engine (see `docs/SPEC.md`); users can also add kinds in
`loopboard.config.json`.

1. Add the kind and its ordered stages to the engine's built-in kind table.
2. Add a starter template for the kind under `templates/` (the sections in order and one example row), following
   the naming of the existing templates.
3. Add the kind to the table in `docs/FORMAT.md` and the README, and to `skills/hub-setup/references/kind-inference.md`
   if folders can hint at it.
4. Add a test in `test/` that parses the template and checks every stage is accepted and an unknown stage fails.

## Pull requests

- One change per PR; describe what and why in plain words.
- Update docs and `CHANGELOG.md` (under the unreleased heading) with the change.
- Do not commit generated pages, tokens, logs or a `.hub/` folder (they are ignored; keep it that way).

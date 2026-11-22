# Publishing checklist (maintainers)

Do these in order for every release.

## Every release

- [ ] `node --test` passes locally, and CI is green on ubuntu, macos and windows (Node 18 and 22).
- [ ] Run the secret and personal-data scan (the privacy test, plus a grep of the diff for tokens, emails and
      absolute home paths). Nothing found.
- [ ] Bump `version` in `.claude-plugin/plugin.json` (Claude Code uses it to decide whether users get an update; no
      bump means no update). Keep `marketplace.json` consistent.
- [ ] Move the `CHANGELOG.md` entries from "Unreleased" to the new version with today's date.
- [ ] Commit, then create an annotated tag `vX.Y.Z` matching the plugin version, and push the tag.
- [ ] Create a GitHub release for the tag with the changelog entry as the notes.
- [ ] After release, test the install on a clean machine or profile:
      `/plugin marketplace add bealitamoor/loopboard` then `/plugin install loopboard@loopboard`, then run
      `/loopboard:hub-setup` in an empty folder.

## Never

- Never rename the plugin after it is published: the name is the install key (`loopboard@loopboard`) and the
  skill namespace (`/loopboard:<skill>`). A rename breaks every existing install.
- Never reuse or move a tag; publish a new patch version instead.
- Never publish with a failing test or a skipped scan.

## One-time setup

- [ ] Set the GitHub repository topics: `claude-code-plugin`, `claude-code-marketplace`, `agent-skills`,
      `claude-skills`.
- [ ] Check the copyright holder in `LICENSE` and the `author` / `repository` / `homepage` fields in `plugin.json`.
- [ ] Confirm `bealitamoor` is the GitHub account you publish under (README and docs use it).
- [ ] Add `docs/screenshot.png` (referenced from the README) and check it contains no personal data.
- [ ] Plugin names may not start with `claude-`, `anthropic-` or `cc-plugin-`; confirm the name is still allowed.

## Optional listings

- [ ] Submit the plugin at claude.ai/directory/manage (optional).
- [ ] Apply through the awesome-claude-code issue form once the repository has 14 days of history.
- [ ] Skills also install on their own with `npx skills add bealitamoor/loopboard`: keep `skills/` flat (one folder per
      skill) so that keeps working. That route installs only the skills, not the CLI or the hooks.

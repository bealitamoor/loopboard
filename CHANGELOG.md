# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project uses [semantic versioning](https://semver.org/).

## [0.1.0] - Unreleased

### Added
- Local dashboard over plain `STATUS.md` files: one file per workstream, a board with stages and status, an items
  detail page per row.
- Comment threads per row and per project, so a person can leave instructions for an agent and read its replies.
- `loopboard` CLI (short alias `lb`): `init`, `new`, `doctor`, `build`, `serve`, `open`, `service`, `thread`, `list`.
- Seven kinds: `app`, `pipeline`, `campaign`, `research`, `design`, `social`, `plan`.
- Guard hooks that keep Board rows and threads CLI-only and remind the agent to update `STATUS.md`.
- 21 skills in five role packs plus core: hub-setup, hub-work, hub-status, hub-standup, hub-weekly (core);
  dev-ticket, dev-release, dev-bug (developer); design-brief, design-review, design-handoff (designer);
  social-calendar, social-post, social-recap (social); plan-week, plan-today, plan-review (planner);
  seo-calendar, seo-article, seo-indexing, seo-weekly (SEO).
- Support for macOS, Windows and Linux; zero dependencies (Node 18 or newer).
- Docs: README, `docs/FORMAT.md`, CONTRIBUTING, AGENTS, `docs/PUBLISHING.md`.

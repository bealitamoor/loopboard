# Inferring a project's kind from its folder

Look at file names only (no need to read contents). First match wins; show the guess to the user and let them
correct it. When nothing matches, ask. Kinds and stages: see `docs/FORMAT.md`.

| Markers in the folder | Kind | Why |
|---|---|---|
| `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle(.kts)`, `*.csproj`, `Package.swift`, `pubspec.yaml`, `Gemfile`, `composer.json` | `app` | software with build, test, review, release |
| `*.fig`, a `figma` link in the README, folders named `design`, `wireframes`, `mockups`, `brand`, `ui` | `design` | design work with brief to handoff |
| folders named `posts`, `social`, `captions`, `content-calendar`, files like `calendar.csv` with channel names | `social` | posts that go through draft, schedule, post, measure |
| folders named `articles`, `blog`, `seo`, `keywords`, `sitemap.xml` next to markdown posts | `campaign` | dated plan with draft, publish, index, promote |
| folders named `videos`, `episodes`, `scripts`, `renders`, `storyboards`, `*.mp4`, `*.srt` | `pipeline` | content made in repeated steps |
| folders named `research`, `notes`, `spikes`, `experiments`, mostly markdown with questions | `research` | investigations with answer and decision |
| a personal task list, `todo.md`, `backlog.md`, no code | `plan` | backlog, this-week, today, done |

Tie-breakers:
- A repository with code and a `docs/` or `marketing/` folder is `app`; track the marketing work in a second
  workstream (its own folder and `STATUS.md`), not as stages of the app.
- One workstream, one kind. If a folder mixes two kinds of work, propose two workstreams.
- A custom stage set can be added in `loopboard.config.json` under `kinds`; offer it only when no built-in fits.

Suggested areas (the user may rename): `app` and `design` go under `Work`, `social`, `campaign` and `pipeline`
under `Content`, `research` and `plan` under `Lab` or `Personal`.

Folders to skip when scanning: the configured `skip` list (`node_modules`, `.git`, `dist`, `build`, `vendor`,
`.venv`), hidden folders, and any folder that already has a `STATUS.md` (it is already a workstream).

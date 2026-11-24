# loopboard — spec for the open-source version

Name: `loopboard` (plugin names may not start with `claude-`, `anthropic-`, `cc-plugin-`). Source it is generalized from: a private hub (not in this repo). This file is the contract for the
build; README is written for users.

## What it is

A local, zero-dependency dashboard over plain `STATUS.md` files, plus comment threads (`THREAD.jsonl`) that let a
person give an AI coding agent instructions per item, and hooks that make the agent follow the rules. Works for **one
project** (a single `STATUS.md` at the repo root) or **many** (a workspace folder scanned for every `STATUS.md`).
Roles: developer, designer, social-media poster, planner, SEO — each gets a stage set (kind) and a skill pack.

## Principles

1. **Zero dependencies.** Node ≥ 18 standard library only. No build step.
2. **No personal data in the repo.** Generated page, token, logs and caches live in the user's data dir, never in
   the repo or the workspace: `$LOOPBOARD_HOME` › `${CLAUDE_PLUGIN_DATA}` › OS default
   (`~/Library/Application Support/loopboard` · `%APPDATA%\loopboard` · `$XDG_DATA_HOME/loopboard` or
   `~/.local/share/loopboard`).
3. **No hard-coded paths, areas, apps or names.** Everything comes from config.
4. **Cross-platform:** macOS, Windows, Linux. Paths via `node:path`; no shell-only features in the engine.
5. **Local only by default:** server binds 127.0.0.1; token-checked writes; Host/Origin checks (keep the existing
   hardening).
6. **Agents never write as the user.** Agent writes are `by: agent`; only the token-checked page writes `by: you`.

## Repo layout (one repo = plugin + its own marketplace)

```
.claude-plugin/plugin.json        name, version, description, author, license MIT, repository, keywords
.claude-plugin/marketplace.json   one entry, source "./"
bin/loopboard.mjs                       the CLI (also runnable as `node bin/loopboard.mjs`)
engine/                           lib.mjs config.mjs build.mjs thread.mjs server.mjs guard.mjs platform.mjs skills.mjs client.js hub.css
hooks/hooks.json                  SessionStart / PreToolUse / Stop → node "${CLAUDE_PLUGIN_ROOT}/engine/guard.mjs" <event>
skills/                           core skills + role packs (see below)
templates/                        STATUS.md per kind, loopboard.config.json example
examples/demo-workspace/          3 fake workstreams (dev app, social campaign, design) — fictional data only
test/                             node:test suites (`node --test`)
docs/                             SPEC.md, FORMAT.md (STATUS.md format), PLATFORMS.md, SECURITY.md
README.md LICENSE CHANGELOG.md CONTRIBUTING.md .gitignore .github/workflows/test.yml
```

## Config: `loopboard.config.json` (found by walking up from cwd; else `$LOOPBOARD_CONFIG`; else data dir)

```json
{
  "roots": ["."],                       // folders to scan (relative to the config file); one project = ["."]
  "mode": "auto",                       // auto | single | multi  (auto: single if roots[0]/STATUS.md exists and no nested ones)
  "areas": ["Work", "Content", "Lab"],  // sidebar groups, in order; unknown areas go last
  "skip": ["node_modules", ".git", "dist", "build", "vendor", ".venv"],
  "port": 4747,
  "editor": "code",                     // command used for "Open in editor" (code, cursor, zed, subl, idea, none)
  "kinds": {},                          // optional extra kinds: { "name": ["stage1", "stage2", ...] }
  "skills": { "user": true, "dirs": [] } // Skills catalog: read ~/.claude/skills (false hides it); extra skill folders
}
```

## Kinds (stage sets) — built in, extendable via config

| kind | stages |
|---|---|
| app | plan → build → test → review → merged → released |
| pipeline | idea → script → assets → voice → render → ready → published |
| campaign | plan → draft → review → published → indexed → promoted |
| research | open → researching → answered → decided |
| design | brief → explore → wireframe → visual → review → handoff → shipped |
| social | idea → draft → visual → scheduled → posted → measured |
| plan | backlog → this-week → today → done |

Status (all kinds): todo · doing · waiting · blocked · done.

## CLI (`loopboard <command>`, short alias `lb`; every command works with `node bin/loopboard.mjs`)

| command | does |
|---|---|
| `loopboard init [--single\|--multi] [--areas a,b]` | writes `loopboard.config.json` here; with `--single` also a starter `STATUS.md`; never overwrites |
| `loopboard new <folder> --title T --kind K [--area A]` | creates `<folder>/STATUS.md` from the kind's template |
| `loopboard doctor` | checks Node version, config, data dir, port, every STATUS.md format; prints fixes |
| `loopboard build [--check]` | renders the page into the data dir; `--check` only validates (writes nothing) and fails on format errors |
| `loopboard serve [--port N]` | runs the local server (foreground) |
| `loopboard open` | opens the served page in the default browser (starts nothing) |
| `loopboard service install\|remove\|status` | keep the server running in the background: launchd LaunchAgent with KeepAlive (macOS); Startup folder + hidden launcher with a restart loop, no admin (Windows); `systemd --user` with `Restart=on-failure` (Linux). `loopboard serve` in a terminal works everywhere without any service |
| `loopboard thread open\|show\|add\|resolve\|reopen\|set\|order\|addrow\|rmrow …` | same verbs as the private version; agent writes only |
| `loopboard list` | workstreams with health, waiting count, open comments |
| `loopboard skills [--role R] [--json]` | the skills catalog (same data as the page's Skills view), grouped by role; `--json` prints it without bodies |

## Platform layer (`engine/platform.mjs`)

- `dataDir()`, `reveal(path)` (macOS `open -R`, Windows `explorer.exe /select,`, Linux `xdg-open` on the folder),
  `openUrl(url)` (`open` / `cmd /c start ""` / `xdg-open`), `openInEditor(path, editorCmd)` (spawn the editor CLI with
  `-g`/`--goto` where supported; fall back to openUrl of the file). Use `spawn` with an args array — never a shell
  string built from user paths. The HubReveal.app / custom URL scheme of the private version is **dropped**: the
  served page calls the local API instead; opening `index.html` as a file is read-only.
- Service install generates the platform unit file into the data dir and registers it; `remove` undoes it.
  - macOS: `~/Library/LaunchAgents/com.loopboard.server.plist`, `launchctl bootstrap`, KeepAlive.
  - Linux: `loopboard.service` linked into `systemd --user`, `Restart=on-failure`.
  - Windows (no admin, no visible window, no Task Scheduler): `service install` writes `<data>\loopboard-run.cmd`, a restart
    loop (`:loop`, exit if `stop.flag` exists, run `node <script> serve` with stdout and stderr appended to
    `<data>\server.log`, `timeout /t 5 /nobreak >nul`, `goto loop`), and `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\loopboard.vbs`,
    which runs that .cmd hidden (`CreateObject("WScript.Shell").Run """<cmd>""", 0, False`, quotes doubled). It deletes any `stop.flag`
    and starts the .vbs with `wscript.exe`. `service remove` writes `stop.flag`, kills the pid in `<data>\server.pid`
    (`taskkill /PID <pid> /F`, optional) and deletes the .vbs; logs stay. `service status` reports whether the Startup
    file exists and whether this instance answers on the port (the `X-Loopboard` identity check).
  - `loopboard serve` writes `<data>/server.pid` once it is listening and deletes it on a clean exit (all platforms).

## Hooks (plugin `hooks/hooks.json`) — generalized guard

Active only inside the configured roots. Keep the private guard's rules, re-pathed: deny hand edits of `THREAD.jsonl`
and of `## Board` table rows (prose stays editable; write via `loopboard thread`), shell writes to `STATUS.md`, agent calls
to the local server port, reading the token file, writing threads `--by you`. SessionStart injects open comments for
the current workstream (or "none"). Stop blocks once when files of a workstream changed but its `STATUS.md` did not.
Config `"guard": false` turns it off. Test every rule in `test/guard.test.mjs`.

## Skills

Core (plugin namespace `/loopboard:<name>`):
- `hub-setup` — onboarding: ask single vs many, write config, scan for projects, create STATUS.md per workstream
  from templates (infer kind from the folder: package.json/gradle → app, etc.), run doctor, start the service.
- `hub-work` — work one item or the inbox from its thread (generalized from the private skill).
- `hub-status` — end-of-session update: Now/Next/Done recently/Waiting on you, `updated:` date, rows via CLI.
- `hub-standup` — daily: what is waiting on me, what is doing, what is blocked, across all workstreams.
- `hub-weekly` — weekly review per workstream: done this week, slipped, next week; writes `reports/week-YYYY-MM-DD.md`.

Role packs (each skill reads/writes the hub through the CLI, never hand-edits rows):
- **dev**: `dev-ticket` (plan → build → test → PR, row moves through app stages), `dev-release` (ledger + tag
  checklist), `dev-bug` (repro → fix → verify → row + lesson).
- **design**: `design-brief`, `design-review` (checklist against brief, accessibility), `design-handoff` (specs,
  assets list, row → handoff).
- **social**: `social-calendar` (N-day plan as board rows, kind social), `social-post` (draft one post in the user's
  voice, no AI clichés, links in first comment), `social-recap` (what was posted, numbers to fill).
- **planner**: `plan-week` (pick this-week rows, order by priority), `plan-today` (top 3), `plan-review`.
- **seo**: `seo-calendar` (article plan as campaign rows), `seo-article` (brief → draft → review), `seo-indexing`
  (track published → indexed rows, what to request), `seo-weekly` (numbers table with [fill] gaps).

Every SKILL.md: frontmatter `name` = folder name, a `description` with trigger phrases, body < 300 lines, imperative
steps, the exact `hub` commands, and a "done when" line. Portable per the Agent Skills spec (agentskills.io); Claude
Code-only fields only when needed.

## Skills catalog (`engine/skills.mjs`, page route `#skills` and `#skills/<name>`, CLI `loopboard skills`)

Collected at build time into the page data (`skills`), from: the plugin's `skills/` (`/loopboard:<name>`), `.claude/skills` in
each root, `~/.claude/skills` when config `skills.user` is not false (default true), and `skills.dirs`. Per skill: `name`,
`description`, `argument-hint`, `category` or `metadata.role`, the body, and the files in `references/` and `scripts/`.

- **Role:** `category` / `metadata.role` if present (`dev` and `developer` are the same), else the name prefix (`hub-` Core,
  `dev-` Developer, `design-` Designer, `social-` Social, `plan-` Planner, `seo-` SEO), else Other, grouped by source.
- **Card:** name, summary (first sentence), "When to use" (the rest of the description from a "Use when" clause; hidden when
  empty), the hint only when there is one, a source badge and Copy (`/loopboard:hub-work <stream> <ID>`: the first form of the hint).
- **Detail:** the body through the page's `md()` renderer (HTML escaped, no raw HTML, soft-wrapped lines joined), the file
  lists and Open in editor through `POST /api/open`, which accepts a path outside the roots only when it is exactly a
  catalogued skill folder, `SKILL.md` or listed file.
- **Safety:** everything is escaped text; a file is read up to 200 KB, 500 skills at most, about 8 MB of body text per page;
  unreadable skills are skipped; a link inside a skill folder that resolves outside it is never read or listed (a skill
  folder that is itself a link is followed). A stream titled "Skills" gets the id `skills-2` so `#skills` stays the catalog.
- Tests: `test/skills-catalog.test.mjs`.

## Tests and CI

`node --test test/` covers config discovery, single vs multi detection, STATUS.md parsing/format check, thread
writes, server API checks (host/origin/token/content-type), guard rules, platform command selection (mock spawn).
GitHub Actions matrix: ubuntu, macos, windows × Node 18, 22.

## Privacy checklist (must pass before publish)

`.gitignore` covers `*.token`, generated `index.html`, `.hub/`, logs. `test/no-personal-data.test.mjs` greps the repo
for absolute home paths, emails, tokens and fails if found. Example workspace is fictional.

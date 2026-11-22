---
name: seo-indexing
description: Track published articles until they are indexed: list what is published but not indexed, what the user should request or check, and move rows to indexed only with evidence. Use when the user says "is it indexed", "indexing status", "what should I submit to Google", "request indexing", "track my published pages", "why is my page not indexed", or "check indexing".
argument-hint: "<stream>"
---

# seo-indexing: published to indexed

Kind `campaign`: `published` then `indexed` then `promoted`. This skill keeps the published-but-not-indexed list
honest. Indexing status comes from the search engine's own tool (for example Search Console's URL inspection and
page indexing report), which the user checks or exports; you do not guess it.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **List the candidates.** Board rows at stage `published` (not yet `indexed`), with their live URL from
   `## Items` and publish date.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
2. **Prepare an indexing sheet** in `reports/indexing-<YYYY-MM-DD>.md` (editor tool):
   ```
   | ID | URL | Published | Days since | In sitemap | Internal links in | Status (user checks) | Action |
   | A03 | <url> | <date> | <n> | [fill] | [fill] | [fill: indexed / discovered not indexed / crawled not indexed / excluded] | <below> |
   ```
   "Days since" you can compute. Everything the search engine knows is a `[fill]` until the user provides it.
3. **Give the user the exact checks**, per URL, in this order:
   1. Open the URL; confirm it loads, returns 200 and is not behind a login.
   2. Confirm the URL is in the sitemap and the sitemap is submitted.
   3. Check there is no `noindex` tag, no robots block, and the canonical points to itself.
   4. In the search engine's inspection tool, read the page's status, then use "request indexing" once.
   5. Confirm at least two internal links from indexed pages point to it; list pages that should link and add
      them (propose edits).
4. **Interpret the status the user pastes**:
   - Indexed: move on.
   - Discovered or crawled but not indexed: usually weak internal linking or thin or duplicate content; propose
     two concrete fixes (links from stronger pages, a better answer or more original detail).
   - Excluded or blocked: name the cause shown and the fix.
   Wait about 1 to 2 weeks after a request before re-requesting; do not suggest repeated requests.
5. **Move rows only on evidence.** When the user confirms a URL shows as indexed (a pasted status or a search for
   the exact URL):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage indexed
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> note "indexed <YYYY-MM-DD>"
   ```
   Rows that are stuck: add a note with the status and the next action:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "<fix to try>, recheck <date>"
   ```
6. `loopboard build --check`, then tell the user the list: indexed, waiting, stuck with a fix.

Voice for any suggested copy edits: [../seo-article/references/writing-rules.md](../seo-article/references/writing-rules.md).

## Done when

Every `published` row has an indexing sheet line, statuses are the user's evidence or `[fill]`, and only rows with
evidence moved to `indexed`.

## Never

- Say a page is indexed or ranking without evidence from the search engine's tool.
- Suggest spammy tactics (bought links, mass submission tools, repeated re-requests).
- Log in to the user's search console or analytics yourself; use only what they paste or a tool they approved.
- Edit board rows or the thread file by hand; use `loopboard thread`.

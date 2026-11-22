---
name: seo-article
description: Take one SEO article from brief to draft to review, in a plain human voice with sourced facts, real internal links and no invented numbers, and keep its campaign row in sync. Use when the user says "write the article for <ID>", "draft this blog post", "SEO brief for", "write about <keyword>", "review this article", or "turn this outline into an article".
argument-hint: "<stream> <ID>"
---

# seo-article: brief, draft, review

Kind `campaign` stages used here: `plan` (brief) then `draft` then `review`. `published`, `indexed` and `promoted`
are set after the user publishes (see `seo-indexing`). Rules for voice and facts:
[references/writing-rules.md](references/writing-rules.md). The pre-publish list: [references/article-checklist.md](references/article-checklist.md).

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Read the row.**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
   Note the primary keyword, intent, cluster, date, and any `decision` comments.
2. **Brief** (stage `plan`). Write `articles/<ID>-<slug>.md` with a brief block at the top (editor tool):
   reader and the question they arrive with; primary keyword and 2 to 4 related phrases (from the user's data or
   the page itself, not invented); the one-sentence answer; outline with H2s; sources to use; internal links to
   add (real existing pages only); what this adds that the top results lack, `[fill]` if you have not looked.
   Ask the user to confirm the brief if the angle is new.
3. **Draft** (stage `draft`). Write the article under the brief: a title of about 60 characters or fewer with the
   keyword near the front; a meta description of about 155 characters; one H1; the answer within the first
   paragraph; H2 sections that match the outline; short paragraphs; examples from the user's real experience or
   provided material. Facts: only from sources you can link or from the user. A missing number is `[fill: <what,
   from where>]`. Link to real internal pages; use `[fill: link to <page>]` when unsure the page exists.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage draft
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status doing
   ```
4. **Self-review** with the checklist and the banned-phrase list. Fix, then re-read for repetition and filler.
5. **Review** (stage `review`). Hand over to the user with the open `[fill: ...]` items listed:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage review
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "Fill gaps, approve, publish"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> note "Draft ready: articles/<file>.md. Open gaps: <n>. Checklist: <x/y>." --no-build
   ```
   Add `doc | Article | articles/<file>.md` to the row's `### <ID>` block in `## Items` (editor tool).
6. After the user publishes: they tell you the live URL; add `url | Live | <link>` to `## Items`, set
   `stage published` and `date <YYYY-MM-DD>`. Next is `seo-indexing`.

## Done when

The article file exists with a brief, title, meta description and body, every fact is sourced or a `[fill: ...]`,
the checklist is filled in honestly, and the row is at `review` and `waiting`.

## Never

- Invent statistics, quotes, studies, rankings, testimonials or links.
- Use cliches ("game-changer", "in today's fast-paced world", "ultimate guide") or keyword stuffing.
- Publish, push to the site's repository or edit the live site without the user's request.
- Claim a page is indexed or ranking.
- Edit board rows or the thread file by hand; use `loopboard thread`.

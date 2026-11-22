---
name: seo-calendar
description: Plan a content calendar for SEO as campaign rows: a set of articles, each with a target keyword, search intent, cluster and publish date. Use when the user says "plan SEO articles", "content calendar for SEO", "keyword plan", "what should I write about", "30 day SEO plan", "topic clusters", or "plan the blog".
argument-hint: "<stream> <days or count>"
---

# seo-calendar: an article plan on the board

Kind `campaign`: `plan` then `draft` then `review` then `published` then `indexed` then `promoted`. A calendar
creates rows at `plan`.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Gather inputs** (read the site and workstream first; ask for what is missing, at most five questions): who
   the site is for and what it offers; the pages and articles that exist; the keyword and query data the user has
   (Search Console export, a keyword tool export, or their own list); how many articles per week they can really
   produce; the goal (traffic, signups, authority on one topic).
2. **Build the topic list from evidence.** Sources, in order: queries that already bring impressions; questions
   the audience actually asks (support mail, forum threads, comments the user pastes); gaps against existing
   pages. Group into 2 to 4 clusters, each with one pillar page and supporting articles.
   Volumes and difficulty: use only numbers from the user's data, else `[fill: volume from <tool>]`. Do not make
   up search volumes.
3. **Propose before creating.** Show a table: `ID | working title | primary keyword | intent (learn, compare, buy,
   fix) | cluster | publish date | internal links to`. Check: one primary keyword per article, no two articles
   chasing the same keyword, each article says what it adds that existing results lack.
4. **After the user's yes, create the rows.** IDs `A01`, `A02`, ... continuing the board:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread addrow <stream> <ID> "<working title>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage plan
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status todo
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> date <YYYY-MM-DD>
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "Brief with seo-article"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> note "<primary keyword>, <intent>"
   ```
   If the board has extra columns (for example `Cluster`, `Keyword`), set them the same way:
   `loopboard thread set <stream> <ID> Cluster "<name>"`. Then order by publish date:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread order <stream> A01 A02 A03 ...
   ```
5. Update `## Now`, `## Next` and `updated:` (editor tool), run `loopboard build --check`, and tell the user the count
   and the first three dates.

Writing style for titles and angles: [../seo-article/references/writing-rules.md](../seo-article/references/writing-rules.md).

## Done when

The user approved the list, every row has an ID, keyword, intent, date and cluster (or a `[fill: ...]`), the board
is ordered by date, and `loopboard build --check` passes.

## Never

- Invent search volumes, difficulty scores, rankings or competitor numbers.
- Create rows before the user approves the plan.
- Plan two articles for one keyword, or more than the user can write.
- Publish or edit the live site; this skill only plans.
- Edit board rows by hand; use `loopboard thread`.

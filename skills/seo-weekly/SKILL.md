---
name: seo-weekly
description: Weekly SEO report: what was published, indexing status, a numbers table (clicks, impressions, average position, per article) with [fill] gaps, and next week's three actions. Use when the user says "SEO weekly", "weekly SEO report", "how is my SEO doing", "SEO numbers this week", "search performance recap", or "what should I do for SEO next week".
argument-hint: "<stream>"
---

# seo-weekly: numbers with honest gaps

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Read the board** for the week:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> PROJECT
   ```
   List rows published this week (stage `published` or later with a Date in range), rows still in `draft` or
   `review`, rows `published` but not `indexed`, and rows that slipped past their Date.
2. **Get the numbers.** Ask the user for a Search Console export or a pasted table for the last 7 days and the 7
   before (queries and pages: clicks, impressions, CTR, average position). If a search-analytics tool is connected
   and the user allows it, read from it; otherwise leave `[fill]`. Never estimate.
3. **Write `reports/seo-week-<YYYY-MM-DD>.md`** (editor tool):
   ```
   # SEO week of <date>
   ## Shipped          <articles published, with live links and dates>
   ## Pipeline         <draft / review counts; rows that slipped and why>
   ## Indexing         <published rows and their status; see seo-indexing>
   ## Numbers
   | Metric | This week | Last week | Change |
   | Clicks | [fill] | [fill] | [fill] |
   | Impressions | [fill] | [fill] | [fill] |
   | Avg position | [fill] | [fill] | [fill] |
   ## By article
   | ID | URL | Clicks | Impressions | Avg position | Top query |
   | A03 | <url> | [fill] | [fill] | [fill] | [fill] |
   ## What the numbers say  <only claims the filled numbers support; mark small samples as noise>
   ## Next week          <3 actions, each tied to a row or a number>
   ```
   Compute change only where both cells are filled. Under about 100 impressions a page, say the sample is too
   small to judge.
4. **Update the board** after the user agrees: new rows for the three actions, notes on slipped rows:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread addrow <stream> <ID> "<action>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage plan
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "<first step>"
   ```
   Then refresh `## Now`, `## Next`, `updated:` (editor tool) and run `loopboard build --check`.
5. Tell the user the report path and the one result that matters most, with a link.

Voice for the "say" and "next" lines: plain, specific, no hype; see
[../seo-article/references/writing-rules.md](../seo-article/references/writing-rules.md).

## Done when

The report lists what shipped and what slipped, the numbers table is either filled from user data or full of
`[fill]` gaps, and next week's actions are on the board.

## Never

- Invent or round numbers, rankings or traffic; do not call a trend from one week of small data.
- Promise a ranking outcome or blame an algorithm update without evidence.
- Log in to analytics or search accounts yourself.
- Overwrite an earlier report.
- Edit board rows by hand; use `loopboard thread`.

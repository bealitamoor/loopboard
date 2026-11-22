---
name: social-recap
description: Recap what was posted in a period, with a numbers table the user fills in, what seemed to work, and what to post next. Use when the user says "social recap", "how did my posts do", "weekly social report", "what did I post this month", "measure the posts", or "recap <channel>".
argument-hint: "<stream> [period, default last 7 days]"
---

# social-recap: what went out and what the numbers say

You list what was posted and prepare a numbers table. The user, or a connected analytics tool they allow, supplies
the numbers. You never make them up.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **List the posts in the period**: board rows at stage `posted` or `measured` with a Date in range, plus
   `## Done recently`.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
   Read `posts/<ID>.md` for each so you can name the angle.
2. **Write `reports/social-<YYYY-MM-DD>.md`** (create `reports/` if needed) with the editor tool:
   ```
   # Social recap, <period>
   ## Posted
   | ID | Date | Channel | Angle | Link |
   ## Numbers
   | ID | Impressions | Reactions | Comments | Shares | Clicks | Follows |
   | P03 | [fill] | [fill] | [fill] | [fill] | [fill] | [fill] |
   ## What the numbers might say
   <only after the table is filled; one to three observations, each pointing at specific rows>
   ## Next
   <3 posts or changes to try, each tied to an observation or marked as a guess>
   ```
   Leave every metric `[fill]` unless the user gave it or a tool they approved returned it. Do not average or
   compare cells that are empty.
3. **Ask for the numbers** in one message: which rows, which metrics, where to find them on each channel.
4. **Once the user fills in the numbers**, complete the observations, then record that measurement happened:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage measured
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status done
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> note "<one line: the result>"
   ```
5. Propose next rows (`social-calendar` does the creating) and `loopboard build --check`.

Voice for the "might say" and "next" lines: plain and specific, as in
[../social-post/references/writing-rules.md](../social-post/references/writing-rules.md).

## Done when

The recap file lists every post in the period with a link, the numbers table is either filled by the user or full of
`[fill]` gaps, and rows are `measured` only where the user supplied numbers.

## Never

- Invent or estimate metrics, or call a post a success or failure without numbers.
- Mark rows `measured` before the numbers exist.
- Scrape or log in to a social account; use only data the user gives or a tool they approved.
- Edit board rows or the thread file by hand; use `loopboard thread`.

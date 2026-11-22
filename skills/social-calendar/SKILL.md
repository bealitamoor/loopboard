---
name: social-calendar
description: Plan N days of social posts as hub board rows (kind social): a mix of post types per channel with a date on each row and a one-line angle. Use when the user says "plan a content calendar", "plan the next 14 days of posts", "social calendar", "what should I post this month", "set up my posting schedule", or "launch week content plan".
argument-hint: "<stream> <days> [channels]"
---

# social-calendar: N days of posts as rows

Stages for kind `social`: `idea` then `draft` then `visual` then `scheduled` then `posted` then `measured`. A
calendar creates rows at `idea`; `social-post` drafts them.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Gather inputs** (read first, ask only for what is missing, at most five questions): the workstream's
   `STATUS.md` and README for what is being promoted; channels (for example LinkedIn, X, Instagram); posting
   frequency the user can keep; the goal (launch, steady growth, event); fixed dates (launches, events); topics
   or pillars; what the user has already posted (`loopboard thread show <stream> PROJECT` and the board).
2. **Propose the mix before creating rows.** Show a short table: date, channel, type, angle. Rules:
   - 3 to 4 repeatable post types (story, lesson, build-in-public update, question, behind the scenes, result).
   - No more posts per week than the user said they can keep; fewer is better than abandoned.
   - Fixed dates first, then fill; no two promotional posts in a row; at least one post in three gives
     something useful without asking for anything.
   - Each angle is one specific sentence about something real. Where the angle needs a fact you do not have, write
     `[fill: <what you need>]`.
3. **After the user's yes, create the rows.** IDs `P01`, `P02`, ... continuing the board's numbering:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread addrow <stream> <ID> "<channel>: <angle in 8 words>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage idea
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status todo
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> date <YYYY-MM-DD>
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "Draft with social-post"
   ```
   Put channel and type in the Note column (or in an extra `Channel` column if the board has one):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> note "<channel>, <type>"
   ```
4. **Order by date** so the top of the board is next to post:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread order <stream> P01 P02 P03 ...
   ```
5. Update `## Now` / `## Next` with the editor tool, then `loopboard build --check`. Tell the user in chat how many
   rows were created and the first three dates.

Follow the voice rules in [../social-post/references/writing-rules.md](../social-post/references/writing-rules.md) for every angle line.

## Done when

The user approved the plan, each row has an ID, an `idea` stage, a date and a one-line angle, the board is ordered
by date, and `loopboard build --check` passes.

## Never

- Create rows before the user approves the proposed plan.
- Promise a frequency the user did not choose.
- Invent results, numbers, quotes or events to fill a slot; leave a `[fill: ...]` gap.
- Publish or schedule anything; this skill only plans.
- Edit board rows by hand; use `loopboard thread`.

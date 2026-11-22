---
name: design-brief
description: Turn a design request into a written brief and a hub row (kind design, stage brief): problem, audience, goals, constraints, deliverables, references, open questions. Use when the user says "write a design brief", "brief for <feature or screen>", "start a design task", "new design request", "what do we need to design", or "scope this design".
argument-hint: "<stream> [ID] | <what needs designing>"
---

# design-brief: one page that says what and why

Stages for kind `design`: `brief` then `explore` then `wireframe` then `visual` then `review` then `handoff` then
`shipped`. This skill covers the first one.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Row.** Use the given row or create one:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread addrow <stream> <ID> "<what is being designed>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage brief
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status doing
   ```
2. **Collect facts, do not invent them.** Read what exists: the request, the product's README or docs, current
   screens or components, earlier briefs, the thread (`loopboard thread show <stream> <ID>`). Ask the user only for what
   the files cannot tell you, in one batch of at most five questions.
3. **Write the brief** to `briefs/<ID>-<slug>.md` in the workstream folder with the editor tool:
   ```
   # <title>
   Owner: [fill]   Due: [fill]   Status: draft
   ## Problem          <what is wrong or missing today, who feels it, evidence if any>
   ## Audience         <who uses this, in what situation, on which device>
   ## Goals            <2 to 4 outcomes, each measurable or checkable>
   ## Non-goals        <what this deliberately does not cover>
   ## Constraints      <brand, platform, tech, accessibility, deadline, content>
   ## Deliverables     <screens, states, assets, specs; the format of each>
   ## References       <links and files: current design, competitors, research>
   ## Open questions   <numbered; who can answer each>
   ## Success check    <how the reviewer will decide it is done>
   ```
   Every section that you cannot fill from facts says `[fill: <what is needed>]`. No invented user numbers.
4. **Link it from the row.** Add under `## Items`, in the `### <ID>` block, a line `doc | Brief | briefs/<file>.md`
   (editor tool), then:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "Answer open questions, then start exploring"
   ```
5. **Ask the open questions in the thread**, one comment per question, and wait for answers if the brief cannot
   move without them:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> question "<question and your recommended default>"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   ```
6. When the user approves the brief (a `decision` or `answer` comment, or their word in chat):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage explore
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status doing
   ```

## Done when

The brief file exists, every open point is a `[fill: ...]` or a posted question, it is linked in `## Items`, and
the row is at `brief` (or `explore` once the user approved).

## Never

- Invent user research, metrics, quotes or deadlines.
- Move the row past `brief` without the user's approval.
- Write the brief as design solutions; it states the problem and the check, not the layout.
- Edit board rows or the thread file by hand; use `loopboard thread`.

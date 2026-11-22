---
name: design-review
description: Review a design (wireframe, mockup, prototype, screenshot or built UI) against its brief and an accessibility and consistency checklist, and report findings by severity. Use when the user says "review this design", "check this mockup against the brief", "design critique", "accessibility check on this screen", "is this ready for handoff", or "review <ID>".
argument-hint: "<stream> <ID> [file or link]"
---

# design-review: check against the brief

Reviews a design for kind `design` rows at stage `review`. You judge against the brief and a checklist; the user
decides whether it passes.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Load context.**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
   Read the brief linked in `## Items` (goals, constraints, success check) and any `decision` comments. Open the
   design: image files in the item's folder, a screenshot, a prototype link the user gave, or the built UI. If you
   cannot see the design, say so and ask for it; do not review from the description.
2. **Walk the checklist** in [references/checklist.md](references/checklist.md): brief fit, hierarchy and layout,
   consistency, states and edge cases, accessibility, content, responsiveness. Check each item against what you
   can see; mark each `ok`, `issue`, or `cannot tell` (say what is needed).
3. **Write the review** to `reviews/<ID>-review-<YYYY-MM-DD>.md` in the workstream folder:
   ```
   # Review: <title> (<date>)
   Verdict: <ready | changes needed | blocked>, one-line reason
   ## Blockers     <must fix; each with where, what, why, suggested fix>
   ## Should fix   <same shape>
   ## Nice to have <same shape>
   ## Checked ok   <short list>
   ## Cannot tell  <what is needed to check it>
   ```
   Every finding points at a place (screen, frame, element) and a rule (brief goal, contrast ratio, target size).
   Quote numbers you measured; if you could not measure, say so.
4. **Post to the thread** one summary note, and one `question` per decision the designer must make:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> note "Review done: <verdict>. <n> blockers, <n> should-fix. Details: reviews/<file>.md" --no-build
   ```
5. **Move the row only as the verdict allows.** Changes needed: stage back to the stage that fixes it
   (`wireframe` or `visual`), status `doing`. Ready: leave the stage at `review`, status `waiting`, and say the
   user must approve before `handoff`.
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "Approve or send back"
   ```

## Done when

The review file exists with a verdict and located findings, the thread has the summary, and the row reflects the
verdict without moving to `handoff` on your own.

## Never

- Approve a design on the user's behalf or move it to `handoff` or `shipped` yourself.
- Review a design you could not see.
- Report vague taste ("feels off") without a rule or a brief goal behind it.
- Invent contrast values or sizes; measure or mark `cannot tell`.
- Edit board rows or the thread file by hand; use `loopboard thread`.

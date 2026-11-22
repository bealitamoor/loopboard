---
name: design-handoff
description: Prepare a developer handoff for an approved design: a spec file (layout, tokens, states, behaviour, copy, accessibility), an asset list with names, sizes and formats, and move the hub row to handoff. Use when the user says "hand off this design", "write the dev spec", "prepare handoff for <ID>", "export list for the assets", "specs for the developers", or "design is approved, hand it over".
argument-hint: "<stream> <ID>"
---

# design-handoff: give developers what they need

Run only on a design the user has approved (kind `design`, after `review`). The handoff is a spec a developer can
build from without asking you.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Check approval.**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
   Look for an approving `decision` or `answer` from the user, or have the user say so now. If there is none, stop
   and ask; do not proceed on a design that is still in review.
2. **Gather the sources**: the final design files in the item's folder, the brief, the review file, the design
   system or style notes. If something is only in a design tool and not readable, ask for an export.
3. **Write `handoff/<ID>/spec.md`** with the editor tool, using only what you can read from the design and files:
   ```
   # <title> handoff
   ## Summary        <what it is, the user goal, link to brief>
   ## Screens        <each screen or frame: name, purpose, entry and exit>
   ## Layout         <grid, spacing scale, breakpoints or device sizes, safe areas>
   ## Tokens         <colors (hex), type (family, size, weight, line height), radii, shadows, with names>
   ## Components     <each component: variants, sizes, states (default, hover, focus, pressed, disabled,
                      loading, error, empty), what changes in each>
   ## Behaviour      <interactions, transitions (duration, easing), validation, what happens on error>
   ## Content        <final copy per element, truncation rules, localisation notes>
   ## Accessibility <contrast ratios, target sizes, focus order, labels, alt text, reduced motion>
   ## Open points    <anything undecided, each as [fill: question, who answers]>
   ```
4. **Write `handoff/<ID>/assets.md`**: a table `file name | purpose | size (px or dp) | scale/density | format |
   source frame | status`. Use lowercase kebab-case names. Raster at the densities the platform needs; vector
   where possible. Mark missing exports `needed`.
5. **Link and move the row.** Add to the `### <ID>` block in `## Items` (editor tool):
   `doc | Spec | handoff/<ID>/spec.md` and `doc | Assets | handoff/<ID>/assets.md`, then:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage handoff
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "Developer confirms the spec is buildable"
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread add <stream> <ID> note "Handoff ready: handoff/<ID>/spec.md and assets.md. Open points: <n>." --no-build
   ```
6. `shipped` is set only when the user confirms it is live.

## Done when

`spec.md` and `assets.md` exist, every unknown is an explicit `[fill: ...]`, both are linked in `## Items`, and the
row is at `handoff` with status `waiting` for the developer.

## Never

- Hand off a design nobody approved.
- Invent measurements, hex values or copy; read them from the files or mark `[fill: ...]`.
- Put design-tool tokens, access links or secrets in the spec.
- Move the row to `shipped` on your own.
- Edit board rows or the thread file by hand; use `loopboard thread`.

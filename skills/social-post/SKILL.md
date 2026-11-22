---
name: social-post
description: Draft one social post (or the same idea for several channels) in the user's own voice from a hub row, with no AI cliches, real numbers or [fill] gaps, 3 to 5 hashtags at most, and links placed in the first comment for LinkedIn. Use when the user says "draft a post about", "write the LinkedIn post for <ID>", "turn this into a post", "write a thread", "caption for this", or "draft <ID>".
argument-hint: "<stream> <ID> [channel]"
---

# social-post: one post, in a human voice

Moves a kind `social` row from `idea` to `draft`. The writing rules are in
[references/writing-rules.md](references/writing-rules.md); read them before drafting.

CLI: `loopboard <args>` below means `node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" <args>` (plain `loopboard` works if it is on PATH).

## Steps

1. **Read the row and its thread.**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread show <stream> <ID>
   ```
   Note the channel, the angle, the date, and any `decision` comments (they override older instructions).
2. **Get the voice.** Look in the workstream for past posts or a voice note file. If there is none, ask the user
   for two samples of their own writing and who the reader is. Do not guess a voice.
3. **Get the facts.** What happened, which numbers, which links. Use only what the user or the files provide.
   Missing number: write `[fill: <what number, from where>]`. Never invent a metric, a customer or a quote.
4. **Draft** to `posts/<ID>.md` in the workstream folder (editor tool), one `## <Channel>` section per channel.
   Keep each section ready to paste:
   ```
   ## LinkedIn
   <post text>
   ## First comment
   <link and one line of context>
   ## Hashtags
   <3 to 5>
   ## Image / alt text
   <what image, and a plain-language alt text>
   ```
   Channel rules: LinkedIn puts links in the first comment, not in the post. Hashtags: 3 to 5 at most. Per-channel
   length and style: see the reference file. If the user wants options, give two openings, not two full drafts.
5. **Check it** against the "before you hand it over" list in the reference. Remove every banned phrase. Read it
   aloud mentally: it should sound like the samples.
6. **Update the row and show the user.**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage draft
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> status waiting
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> next "Review the draft, then add the visual"
   ```
   Add a `kit | posts/<ID>.md` line to the row's `### <ID>` block in `## Items` (editor tool) so the page shows each
   section as a copy-ready field. Paste the draft in chat inside a code block and list the `[fill: ...]` gaps.
7. After the user edits or approves: `stage visual` when an image is needed, then `scheduled` and `posted` only
   when the user says they scheduled or posted it:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread set <stream> <ID> stage visual
   ```

## Done when

`posts/<ID>.md` exists with a section per channel, no banned phrases, every number sourced or marked `[fill: ...]`,
the row is at `draft` and `waiting`, and the user has the text to review.

## Never

- Post, schedule or send anything; the user does that.
- Use cliches ("game-changer", "thrilled to announce", "in today's fast-paced world") or more than 5 hashtags.
- Put a link in a LinkedIn post body.
- Invent numbers, results, quotes, testimonials or tags of real people.
- Mark a row `posted` or `measured` yourself.
- Edit board rows or the thread file by hand; use `loopboard thread`.

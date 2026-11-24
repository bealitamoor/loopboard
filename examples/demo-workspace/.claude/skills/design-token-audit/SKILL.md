---
name: design-token-audit
description: Find colours and spacing values in the Brand Refresh files that are not design tokens. Use when the user says "audit the tokens", "find hard-coded colours", or "are we using the palette?".
argument-hint: "[folder]"
metadata:
  role: designer
---

# design-token-audit

Run `scripts/find-colours.sh <folder>`, group the hits by file, and map each one to the nearest token.
Done when every hit has a token or a note saying why it stays.

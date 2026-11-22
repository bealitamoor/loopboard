# Design review checklist

Mark each item `ok`, `issue` or `cannot tell`. Skip items that do not apply and say so once.

## 1. Brief fit
- [ ] Every goal in the brief is served by something visible in the design.
- [ ] Nothing listed under non-goals crept in.
- [ ] Every constraint (brand, platform, deadline, tech) is respected.
- [ ] The success check in the brief can be answered from the design.

## 2. Hierarchy and layout
- [ ] One clear primary action per screen; secondary actions look secondary.
- [ ] Reading order matches importance; the eye lands on the right thing first.
- [ ] Spacing follows a consistent scale; alignment on a grid; related things grouped.
- [ ] Nothing important depends on color alone.

## 3. Consistency
- [ ] Colors, type sizes, radii, shadows and icons come from the design system or one stated set.
- [ ] Same thing looks the same everywhere (buttons, inputs, empty states, errors).
- [ ] Naming and wording match the product's existing terms.

## 4. States and edge cases
- [ ] Default, hover or pressed, focus, disabled, loading, empty, error and success states are designed.
- [ ] Long text, very short text, large numbers, missing images and many items have a defined behaviour.
- [ ] Destructive actions confirm or can be undone.
- [ ] Offline, slow-network and permission-denied cases are covered where relevant.

## 5. Accessibility
- [ ] Text contrast at least 4.5:1 (3:1 for large text and UI component edges). Measure; do not eyeball.
- [ ] Touch targets at least 44x44 pt (iOS) or 48x48 dp (Android); 24x24 CSS px minimum on web, with spacing.
- [ ] Visible keyboard focus on every interactive element; logical focus order.
- [ ] Text can scale to 200% without loss; no fixed-height containers that clip it.
- [ ] Images that carry meaning have alt text written; decorative ones are marked.
- [ ] Form fields have visible labels (not placeholders only) and error text that says how to fix it.
- [ ] Motion is optional or reducible; nothing flashes more than three times a second.
- [ ] Color-blind safe: status and charts distinguishable without hue.

## 6. Content
- [ ] Real copy, not lorem ipsum, in the places that matter.
- [ ] Labels are verbs for actions and nouns for places; no jargon the audience does not use.
- [ ] Error and empty-state messages say what happened and what to do next.

## 7. Responsiveness and platform
- [ ] Layouts defined for the smallest and largest target sizes named in the brief.
- [ ] Platform conventions respected (back behaviour, safe areas, system controls).
- [ ] Orientation and dark mode covered if the brief asks for them.

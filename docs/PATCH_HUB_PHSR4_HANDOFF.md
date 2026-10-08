# PHSR4 — SR champion card polish (WIP, not ready)

Base: origin/main d528bf9f. Branch patchhub/phsr4-card-polish. Not pushed.

## Changes
- CombatLabHandoffLink: quiet secondary link (flask + visible "Combat Lab", muted, no border). aria-label and textContent remain the full "Open {Champion} in Combat Lab"; href unchanged.
- EntityHeader: grid layout; actions cluster top-right on desktop, compact row under identity text on phone (portrait spans both rows); wrapper only when the slot returns something (testid patch-report-entity-actions). Share icon unchanged beside title.
- EntityCard: outer border border/45, no shadow.
- AbilityGroup: inset neutral hairline dividers between groups; neutral icon frames (gold kept for slot letters and Riot new values); passive art from the existing Combat Lab store (`getAbilityIconUrl(ref,"P")`) for SR Champions-section champions only, when backend has no icon; P glyph fallback on error. All 27 passive champions in the 26.10–26.19 corpus return 200 for passive.png.

## Browser (headless Edge, 26.19, supabase blocked)
1280/375/320: no horizontal overflow, no clipped elements, no page errors; focus ring present on Combat Lab. Gold-bordered rectangles in view roughly halved (1280 Aatrox 12→6). Mobile header 145→135px, Combat Lab 206px bordered row → 107px quiet link.

## Remaining
- 1 failing test: PatchReportEntityCard.test.tsx "slot glyph when no icon exists" — passive now gets stored art; update the fixture/assertion (glyph path still applies to non-SR / unmapped cards).
- New tests for the 10 listed items not written yet.
- tsc not run; full regression not run.

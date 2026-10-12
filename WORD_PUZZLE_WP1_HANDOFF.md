# WORD PUZZLE WP1 — handoff (interrupted: usage limit)

Branch `word-puzzle/wp1-fable`, worktree `C:/Users/mlmit/mogzy-wt/wp1-fable`, based on
`origin/main` `12054aab` (verified at start). Backend read-only at
`League_Combat_Simulator/.worktrees/reconstruct-r1-be` `afcedd43` (authority files only).
Local only. Not pushed, not merged, not deployed.

Playtest: `/dev/word-puzzle` (DEV-only route; 404 in a production build).
Dev servers: launch.json entries `wp1-assets` (python static server of the backend
worktree on 8799, for champion/item art) and `wp1-fe` (vite 5260 with
`VITE_COMBAT_API_URL=http://127.0.0.1:8799`). Both live in the backend worktree's
ignored `.claude/launch.json`.

## Status when the session was cut off

DONE and observed working in the real browser at 1280×720 inside the real
`CanonicalArena`: open → type (physical keys) → drum tap → arm Sound → sounding hit
(H engraved, sounded state on the drum, record on the plaque) → Lock → ink sweep →
per-socket results (given / sounded / right / wrong-with-struck-glyph / missing) →
plaque turns to the answer + score + note → footnote shows the wiki revision →
lab "reveal done" indicator. Vitest: **54/54** across the three new suites.

NOT DONE:
1. The Playwright continuity spec (`e2e/word-puzzle-continuity.spec.ts`, registered in
   `playwright.arena.config.ts`) is written but **has not been run**. Run it with a
   throwaway config (`baseURL` 5260, `executablePath` to headless-shell-1228 — see the
   `mogsy-playwright-arena-windows` memory) and set `WORD_PUZZLE_SHOTS` to
   `C:/Users/mlmit/OneDrive/Desktop/word-puzzle-wp1-shots`. Expect the "block" region
   to be excluded (it re-flows per round) and check the other regions hold ≤1px.
2. No screenshots at the six viewports yet (the spec writes them).
3. One console warning seen after the reveal: React "Cannot update WordPuzzleLab while
   rendering GlyphPress". Not yet diagnosed; candidates are `useStageRoom`'s
   `flushSync` inside the ResizeObserver, or an `onCue`/`onRevealComplete` call path.
   The lifecycle itself is unaffected.
4. Visual polish still owed: larger sockets on desktop (add 64/56/48 to
   `FORME_CELL_SIZES` and update the one test that expects 44 at 600×300); make the
   player's vellum tiles more distinct from the brass engraved tiles; the drum's left
   rim fade half-covers the ⌫ tile at rest.
5. Handoff sections below are condensed; expand after the spec has run.

## Product thesis

**SPELL** — complete a word or phrase from its fragments. The instrument is a
typesetter's **Glyph Press**: a slate forme with one brass socket per letter (marks
such as an apostrophe or colon engraved as given), a turning brass **drum** carrying the
alphabet, and three **soundings**: arm the press, choose a glyph, and the authority
engraves it in every socket it occupies, or tarnishes it on the drum if it sits nowhere.
Lock pulls the press; the reveal inks the forme left to right and prints each socket.

## Interaction decisions

Hybrid: direct filling (type a letter, or tap a drum tile, into the cursor socket) plus
a capped number of letter calls (soundings). Pure guessing needs a solve step anyway;
pure filling has no progression. Three soundings are the only "economy"; no penalties.
A sounded glyph is fully placed, so it cannot be set elsewhere, and any contradicted
guess falls out (`reconcileValue`). Lock is allowed with blanks so the reveal can show
what was missing. Enter never submits. Keyboard: letters set, Backspace clears back,
arrows move the cursor (forme) or turn the drum (drum), Enter/Space on the drum sets
the centred tile, Escape disarms. Everything is reachable by touch via the drum
(tap = set, drag = turn, ‹ › step) and the plate buttons.

## Files

New: `src/lib/interaction-grammar/glyphPress.ts` (+ test), `src/lib/word-puzzle/authority.ts`
(+ test), `src/lib/word-puzzle/__fixtures__/wordPuzzleRounds.json`,
`scripts/word-puzzle/captureWordPuzzleRounds.ts`, `src/components/interaction-grammar/GlyphPress.tsx`
+ `glyphPress.css` + test, `src/components/interaction-grammar/useStageRoom.ts`,
`src/pages/dev/word-puzzle/WordPuzzleLab.tsx` + `labAuthority.ts`,
`e2e/word-puzzle-continuity.spec.ts`. Edited: `types.ts` (Glyph Press contracts),
`App.tsx`, `Layout.tsx`, `Footer.tsx`, `playwright.arena.config.ts`.

## Content and authority

Ten rounds frozen by the capture script: nine verified verbatim against the backend's
wiki-stamped `range_authority.json` (abilities, champion names) and the item recipe
graph at wiki rev 4065930 (items); one region round (`shurima`) has no repository
authority and is labelled dev-only in the lab chrome and in the fixture. The lab
stand-in owns givens (25% of distinct letters, seeded), soundings and grading; it is
not secret from devtools.

## Next phase

Run the Playwright spec, fix anything it surfaces, apply the polish above, then the
owner playtests. Production seam afterwards: a `glyph_press.v1` module with
`SegmentChoice` widened to `{ glyphs }`, server-side ledger and grading.

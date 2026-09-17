# RS1 — Ranked Responsive Safety

## Objective
Make the current (design-locked) Ranked match fit realistic desktop/laptop
viewports without overlap, clipped question/answers, content under the Module
Rail, Player Column / Question Stage collisions, or page scroll — keeping the
owner's wide-desktop appearance (~1878×800) pixel-identical.

## Baseline
- `origin/main` = `a89e756635b686997dfbf271bfa549bb8bff48b9` ("Fixed stage sizing regression"), unchanged at fetch.
- Branch/worktree: `rs1/ranked-responsive-safety` at `../mogsy-wt-rs1`.

## Responsive architecture (verified, unchanged)
- `ArenaShell` gives the desktop frame a definite `--ranked-stage-h`.
- `CanonicalArena`: header (shrink-0) → arena grid (`lg:flex-1 lg:min-h-0`) → status strip (shrink-0) → Module Rail.
- `.ranked-question-stage` is `min(reserve, 100%)` / `max-height: 100%`; MEDIA region yields, PROMPT/ANSWERS `flex: 0 0 auto`.
- CSS seams: 1024 lock · 1200/861 answer type/padding · 1280 & 1500 reserve steps · ≤860 compaction · 1600×780 wide override (after compaction).

## Measured matrix (Chromium, `/dev/ranked-shell-probe`)
Shapes: `media` (cinematic item), `family` (Combat Calculation, new probe state), `realMax`, `realP99`, `short`, `metareflex`.
Viewports: 1920×1080, 1920×800, 1878×797, 1600×900, 1600×800, 1440×900, 1440×800, 1366×768, 1280×720, 1024×768, plus seams 1599/1600×800, 1600×779/780, 1440×860/861, 1279/1280×800, 1499/1500×800.
Per case recorded: shell, header, grid, both Player Columns, stage, media region/media, prompt (+font size), answers, Module Rail, document scroll, inner scrollers, clipped descendants.

### Baseline result: 109/114 pass
All 5 failures at **1280×720**, every question shape:

| shape | stage h | grid h | column overflow | media region |
|---|---|---|---|---|
| all | 481 | 447 | +34px (both Player Columns and stage) | not yielding (e.g. media 191px) |

Answers stayed inside the parchment, the Module Rail stayed on screen and the
page did not scroll — which is why the existing spec was green. The stage and
both columns sat 34px over the status/abilities strip below the grid.

The old spec's "yields the ART" check also failed at 1600×780→1600×720 for the
same reason (the 720 row floored, so art was *larger* on the shorter screen).

## Failures & root cause
**Classification: fixed/min/max-height conflict (grid track sizing).**
The arena grid had an implicit `auto` row. Its size comes from item content, and
the stage's `min(reserve, 100%)` cannot resolve `100%` during track sizing, so
the row floored at **480.5px** regardless of viewport. Any grid shorter than that
(viewports under ~754px tall at `lg`) overflowed, and the media shrink chain
never engaged because the stage never saw a definite height.

## Decision / fix
`CanonicalArena.tsx`: add `lg:grid-rows-[minmax(0,1fr)]` to the arena grid. The
row becomes exactly the grid's height; the existing chain then lets media yield.
No CSS, font, padding, Module Rail, header or Player Column design change.

### After: 114/114 pass
Diff vs baseline: **only the five 1280×720 rows changed** (stage 481→447, media
e.g. 191→157, realMax 111→77; prompt/answer sizes identical). All other 108
measurements — including 1878×797 and 1920×1080 — are pixel-identical.
**Owner's ~1878×800 appearance: unchanged.**

## Recorded, not changed (non-failing)
- **780px height gate** (1600×779→780): the locked wide override trades media for
  text — media 192→171 (media), 112→33 (realMax); prompt 21→24px, answer padding
  8→18px. Art shrinks as the screen gets 1px taller. Everything fits; smoothing it
  is an owner design call.
- 1599→1600×800 same trade (realMax media 133→53). 1279→1280: frame widens at xl, realMax media 32→157.
- 1024×700 `realMax` (below the tested envelope): media at 0, 1 tablet clipped —
  the documented minimum-height residue, not in the supported matrix.
- `scenario-compact` scrollHeight > clientHeight (~55px) at every viewport,
  including 1920×1080 — pre-existing decorative overflow, not viewport-dependent.

## Changed files
- `src/components/ranked-arena/CanonicalArena.tsx` — the fix.
- `e2e/ranked-arena-fit.spec.ts` — 10-viewport matrix + 9 seam viewports; `family` shape; Meta Reflex; arena geometry assertions (shell ≤ viewport, no column overflows the grid row, stage above the strip below and above the Module Rail, Player Columns don't intersect stage, answers inside stage, no page scroll).
- `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx` — `?q=family` probe state.
- `src/lib/question-surface/familyLayoutFixtures.ts` — export `PHYSICAL_DAMAGE_PRESENTATION` (no behaviour change).

## Tests
- Fit spec with the fix reverted, `-g 1280x720`: 5 failed ("an arena column overflows the grid row it was given"), 2 passed — the new assertion catches the bug.
- Full fit suite (`playwright.arena.config.ts`): **134 passed**, 0 failed.
- `npm run build`: passes.
- Vitest (`ranked-arena`, `question-surface`, probe, `lib/question-surface`): initially 647 passed / 2 failed — stale `QuestionStageGeometry` wide-exception expectations already red on main (17.25rem, no font-size). Updated to guard the approved design (rich media + hero ceiling 19rem; prompt 1.5rem/1.35; answer padding 1.125rem; region reserves still untouched). Now **649/649 passed, 44 files**.
- Fit suite and build not rerun after the test-expectation commit: it changed only a vitest file, nothing runtime.

- `src/components/ranked-arena/QuestionStageGeometry.test.tsx` — stale wide-desktop expectations updated (test-only).

## Status
COMPLETE — approved and merged to `main`.

## Next task
- Later design-tuning pass (out of RS1 scope): the non-breaking 779→780 and 1599→1600 media/text seams.

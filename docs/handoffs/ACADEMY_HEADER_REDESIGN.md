# Academy header redesign + Ranked removal

Date: 2026-10-19/20. Started from `origin/main` 71da9531; both branches later merged main 2a7fa911 (#103). Repository: `mitcherrman/mogsy`.

| Phase | Branch | PR | State |
|---|---|---|---|
| A: Ranked removal | `academy/ranked-removal` | #100 | **MERGED to main as 95ee8517** (owner-authorised). **Not yet live:** it needs the owner's Lovable Publish. Contains no visual redesign. |
| B: Orrery-first masthead | `academy/orrery-first-header` | #102 (draft, base `main`) | **Owner visual review required before merge or publish.** |

Worktrees: `C:\Users\mlmit\mogzy-wt\acore-ranked-removal` and `C:\Users\mlmit\mogzy-wt\acore-header`. Each has a node_modules junction, so `rmdir` the junction before running `git worktree remove`.

## Phase A: Ranked removal

- `AcademyCorePage.tsx` no longer renders the `academy-core-ranked` link on any layout. There is no disabled button, placeholder or Coming Soon label.
- Removed: `RANKED_ROUTE` (`academy-core-destinations.ts`), the `academy_core_ranked` funnel click and its `trackFunnelEvent` import (the book door keeps `academy_core_book`), and the `.acore-cta-secondary` / `.acore-cta-hint` CSS.
- Daily Challenge is unchanged: label, resume wording, `DAILY_START_STATE`, route and intent prefetch. #103's `trackDailyEntry("academy_core_daily_button")` was kept when resolving the merge with main.
- Tests: the unit test asserts that the shortcuts hold exactly one control and no Ranked/Coming Soon text. Both Orrery E2E specs assert that Ranked is absent on desktop and phones. The text-zoom test checks Daily by role.
- CI: added `.github/workflows/academy-core-orrery.yml`, byte-identical to PR #95's copy (blob 0d0096b8).

### Direct navigation (read-only audit; FE 71da9531, BE origin/master 84567e11)

Ranked gameplay is **blocked server side**:
- `POST /api/ranked/queue` returns 503 `RANKED_QUEUE_PAUSED` when `queue_ranked_enabled` is off (`routes/ranked_public.py:912`). It runs before the bot and preset paths and fails closed (`services/platform_policy.py:198`). Only the verified admin bypasses it. The env gate `RANKED_QUEUE_ENABLED` is separate.
- `/quiz?play=1`: the play scroll offers only the visible modes, so Ranked is omitted (`Quiz.tsx:1455`, `playModes.ts:78`).
- `/quiz/ranked` loaded directly only resumes an existing match. With no match it redirects to `/quiz` and never joins a queue (`QuizRankedPage.tsx:274-313, 401`).
- Practice, Daily and Role Challenge have their own gates and are untouched.
- Pre-existing gap, not changed here: `RANKED_QUEUE_PAUSED` is missing from `UNAVAILABLE_CODES` (`useRankedQueue.ts:70`). It shows the server's generic "temporarily unavailable" message instead of the proper unavailable state.

## Phase B: Orrery-first masthead

- `orrery/AcademyMasthead.tsx` (new) holds two pieces:
  - The **crest**: an inline-SVG hex mark, the `Mogzy Academy` h1 (`#acore-title`) and a gold hairline.
  - The **Daily seal**: a gold medallion with an engraved play glyph on an engraved dark-glass plate with a chevron end. It keeps the same link contract (accessible name `Play`/`Resume Daily Challenge`, `academy-core-daily`, `academy-core-shortcuts`, #103's `trackDailyEntry("academy_core_daily_button")`).
- `orrery/academy-core-masthead.css` (new). The page imports it **after** `academy-core-v35.css`, and the order matters because it overrides stacked rules at equal specificity. `academy-core-v35.css` itself is not edited.
  - Desktop: the crest sits above the seal at the head of the left column. The column width and the Orrery's geometry are unchanged. Narrowing the column was tried and reverted: it moved the orbit under the fixed-coordinate drag tests and changed the Patch Report's layout. The Orrery gains the vertical space the old header took. The Patch Report and the Commons/Hall links are unchanged.
  - Phones: crest and seal share one row of about 52 px above the instrument. The crest never shrinks, and the seal label wraps on the narrowest phones (container queries at 359 px and 300 px).
  - Short landscape (< 1024 px wide, landscape, ≤ 560 px tall): the identity and arrows sit beside a viewport-fitted Orrery (height from `--app-viewport-h`), centred in the remaining width. The Patch Report follows below.
  - Reduced motion: the seal's turning tick ring stops.
- `AcademyCorePage.tsx`: the header and the `shortcuts` block are replaced by `<AcademyMasthead dailyResume={dailyResume} />`, plus the import lines.
- No new images or fonts, so the RC2.2 startup gate is unaffected.
- `e2e/academy-core-masthead.spec.ts` + `.github/workflows/academy-masthead-review.yml` check, at every viewport:
  - no Ranked and no horizontal overflow;
  - Daily is in the first viewport, at least 44 px tall and hit-testable;
  - the seal never covers the title;
  - phones: the masthead row is ≤ 64 px and the Core is in the first viewport;
  - landscape: the instrument, all books and both arrows are on screen;
  - desktop: the h1 is ≤ 34 px tall and the stage is ≥ 64 % of the width.
- Screenshots are in the `academy-masthead-screens` artifact of the `academy-masthead-review` run. The cover art is real; the Patch feed and Daily status are stubbed.

## Integration with PR #95 (hover-to-front, on hold)

`git merge-tree` (2026-10-20) of `origin/academy-core/hover-to-front` (cbb1c798) against main 95ee8517 (with Ranked removal) and against `academy/orrery-first-header` 4a26fcb5: **no conflicts** either way. The merged trees keep the Ranked removal in every spec and test, plus the masthead import and render. The workflow file is byte-identical on #95 and main. Next:
1. #95 when approved: merge main into it (clean), rerun `academy-core-orrery`, merge.
2. #102 after the owner's visual approval: merge main into it (clean), rerun both workflows, mark ready, merge, then Lovable Publish.

If #95 changes before then, re-run `git merge-tree --write-tree --name-only <branch> origin/academy-core/hover-to-front`. Phase B's only page hunk is the brand/shortcuts block and its imports; #95's hunks are the hover handlers and slots.

## Test evidence (GitHub Actions, bundled headless Chromium; nothing ran on the owner's PC)

| Run | Unit | Build | Orrery V3.5 spec | V3 spec | Other |
|---|---|---|---|---|---|
| main 71da9531 baseline (temp branch + workflow, 39375604445) | 233/233 | ok | 55/56 | 23/23 | |
| A @31763876 (39377245421) | 234/234 | ok | 55/56 | 23/23 | Gameplay Analytics 384/384 |
| B @4a26fcb5 (39377375343 / 39377375321) | 234/234 | ok | 55/56 | 23/23 | masthead 15/15, Gameplay Analytics 384/384 |

- The single Orrery failure is `selector › the whole orbit turns` (a timing test on the slow runner). It fails identically on the main baseline and on #95, so it is pre-existing and not caused by either change. B also had a fully green Orrery run (39375589555, 56/56).
- B fixed one race in the existing spec: `?quality=lite` now waits for the startup veil to lift before counting animations. Diagnostics showed lite 35–36 vs full 68–69 once settled; the failing 49 included the veil's own glow on a direct load.
- Locally (vitest via the esbuild/rollup-wasm workaround): academy-core, academy-startup, startup shells, the `rankedStartSurfaces` guard and `dailyEntry`, 14 files passing. `tsc`: no diagnostics in academy-core.

### Review screenshots (Phase B)

The artifact `academy-masthead-screens` of run 39377375321 (head 4a26fcb5) holds `test-results/masthead/*.png`: desktop 1366x768, 1920x1080 and 1280x720, the seal hover, phones 320/360/390/430, landscape 640x360 to 932x430, tablet 768x1024 and reduced motion. WebP copies are committed under `docs/handoffs/academy-header-redesign/`.

### Open owner questions (Phase B)
1. Is the seal's slow-turning tick ring wanted? It stops under reduced motion and does not stop in `lite`.
2. In short landscape the Orrery is fitted to the screen height, so the books are about 65–80 px wide. Is that acceptable, or should the page scroll with larger books?
3. Should the desktop crest also show the "Mogzy's Hextech Workshop" eyebrow? Phones hide it.

## Round 2 (2026-10-20): mobile fit + Hextech sigil CTA (commit c9660b76)

The owner approved the desktop direction. Priorities: (1) the mobile composition was cropped on short phones; (2) the Daily CTA needed to be more premium.

### Mobile sizing: what changed in the layout logic
- **Before:** the stacked stage was `width: min(100%, 520px); aspect-ratio: 360/640`, so its height came from the width alone. On 360x640 and 320x568 the lower book tier fell below the fold.
- **1. Height budget** (`orrery/academy-core-phone-fit.css`): stage height = `clamp(86 % of compact-at-full-width, --app-viewport-h - above - below, approved 360:640 at full width)`.
  - above = 4.4rem (hero padding + masthead row + gap).
  - below = the arrow row (3.6rem) on screens >= 600 px tall, and 0.6rem on shorter ones. There, the arrows follow just below the fold and the books and crystal, which also navigate, stay whole.
- **2. Rebalanced composition, not just shrunk** (`orrery/composed-fit.ts`, pure and unit-tested): `composedFit(boxW, boxH)` reads the stage box's aspect and returns 0 (the approved tall 360x640) up to 1 (a compact 360x520). Compact means the tiers are drawn in around the Core (Core 330 -> 290 units at y 262), the books go from 0.92/0.90 to 0.86/0.84, and Mogzy is tucked closer. Values in between are interpolated.
  - `OrreryEngine.resize()` takes the fit for book poses, the Core centre and the tether start.
  - The page sets the scene's `--h` / `--fit` / `data-fit` from it, and CSS moves the Core, instrument and Mogzy by `--fit`.
  - The desktop orbit is untouched.
- **3. Short landscape** uses the compact aspect (360/520), fitted to the screen height.
- **Measured fit on CI:** 360x640 -> 1, 320x568 -> 0.75, 390x844 and 430x932 -> 0 (the approved look, unchanged).

### Daily Challenge CTA
- **Sigil:** a gold bezel with engraved notches, a rune ring turning every 36 s, a faceted Hextech crystal holding the play glyph, and a soft aura pulse every 3.8 s.
- **Plaque:** an engraved plaque with a gold edge, dark Hextech glass and two hairlines, with a sheen passing every 7.5 s.
- **Desktop hover:** the sigil scales and brightens, the pulse quickens and the sheen runs at once.
- **Reduced motion and the `lite` tier:** a lit, still sigil.
- **Size:** 66 px on desktop, 56 px on phones (50 px at <= 300 px). The masthead row stays at about 56 px.
- **Unchanged:** the accessible name, route, router state, prefetch and #103 entry analytics.

### PR #95 overlap
- New files: `composed-fit.ts` (+ test) and `academy-core-phone-fit.css`.
- `OrreryEngine.ts`: imports, a `fit` field, and 4 lines in `resize()` / `renderFrame()`. #95 only adds `steerTo()` around line 250.
- `AcademyCorePage.tsx`: two imports, the fit state, the RO callback and the scene attributes.
- Re-check with `git merge-tree` before integrating.

### Evidence
- `academy-masthead-review` 39381138294: 15/15. It adds per-viewport asserts on 320x568, 360x640, 390x844 and 430x932: all four books and the crystal whole on the first screen, each book >= 96 px wide, and the arrows on screen where the height is >= 600 px. Landscape at 740x360 (and 640x360 to 932x430) fits.
- `academy-core-orrery` 39381138785: unit 242/242, build OK, V3 spec 23/23, V3.5 spec 55/56. The one failure is the known pre-existing orbit-turn test, which also fails on main.
- Gameplay Analytics 39381138352: 384/384.
- The stills in `docs/handoffs/academy-header-redesign/` are this round's captures.

### Known, not changed
- The "BETA" ribbon on Combat Simulation still crosses the Core on phones (pre-existing).

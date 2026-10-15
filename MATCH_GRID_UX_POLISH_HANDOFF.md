# Match Grid MG-UX1 — Approved Frontend Polish

Status: **implemented — READY FOR OWNER VISUAL ACCEPTANCE** (draft PR, not merged, not deployed). No scoring or bot changes. Implementation notes, evidence and remaining limits: see *MG-UX1 implementation* below.

Base: `main` at `4b13c042ef88bff0f3d261b69a3277ecf4ffc2e6`. Recheck origin/main before work. Work on `mg-ux1/match-grid-polish` in an isolated worktree; do not edit main in place.

## Objective
Improve readability, teaching reveal containment, responsiveness and interaction clarity of the existing admin-only Match Grid rune-to-tree game. Preserve existing gameplay and visual identity; do not redesign it.

Approved priorities:
1. Make long rune names distinguishable: no confusing 8.5px/58px captions; a complete name must be accessible by hover/focus/tap/touch even in dense layouts. Avoid overlap, maintain >=44px hit targets.
2. Stop horizontal/vertical clipping of correction ledger. Exact boards get a concise success summary (board remains visible); incorrect boards prominently explain only corrected runes. Full review still available. No teaching content hidden behind timed scrolling.
3. Better use actual available stage/parchment within module boundaries. Preserve constellation for 3 trees, improve rail/ledger for 4–5. No within-round layout jumps and no clashing labels.
4. Improve held/target/placement/Lock feedback, instruction wording and empty well treatment with stable footprint.
5. Tighten responsive typography and wording.

## Verified root causes
- `src/components/match-grid/matchGrid.css`: `.mg-sigil-caption` nowrap/ellipsis; ledger variant `width:58px; font-size:8.5px`; `.mg-ledger-cards` flex overflow-x:auto with min-width 150px cards, while `.mg-root` overflow:hidden.
- `src/components/match-grid/MatchGrid.tsx`: around lines 125–175 picks rail by measured arena `maxHeight`. Rendered sigils have full aria-label but visually truncate. Bottom `Ledger` maps perfect boards to every group and all its members, causing clipped cards; wrong boards produce corrections.
- `src/lib/match-grid/layout.ts`: RAIL constant `rowH=56, sigil=44, sealR=24, firstSeatX=164, pitchX=58, columnW=310, wellPitch=58`, only uses a narrow strip of stage.
- `src/lib/ranked-core/modules/matchGridModule.tsx`: `useStageRoom` measures real arena height and feeds `maxHeight`. Keep server-authoritative reveal and opaque tokens.

## Safety and exclusions
- **DEFER** bots, versus play, timer/speed bonuses, grading, points and all competitive balancing. Owner has not chosen whether these are standalone games or Daily Challenge modules.
- Do not modify shared Ranked Arena toasts/HUD/results in this task; record those separately. No backend/Supabase/Railway work, migrations, deployment or automatic publication.
- Preserve server answer secrecy (no correctness or canonical map before lock), drag/tap-tap/keyboard accessibility, reduced-motion support, stable entity nodes and layout across open→lock→reveal.

## Acceptance evidence
Check 1600×900, 1280×720, 1366×650, 1280×600, 390×844, 360×640 plus tall desktop. All 3/4/5-tree boards: open, partially assigned, fully assigned, perfect and wrong reveals, transition. Include full-name access on mouse/keyboard/touch. All visible correction details readable within available reveal window, no overflow/collisions, ≥44px clickable targets, structural shift ≤1px. Use existing unit tests and browser suites (`MatchGrid.test.tsx`, `layout.rail.test.ts`, `e2e/match-grid-arena-continuity.spec.ts`, `e2e/match-grid-live-release.spec.ts`). Run typecheck/lint and compare against clean current-main baseline, documenting only new failures.

## Delivery
Implement in isolated worktree, commit to this branch, open a **draft PR** (don't merge), and provide before/after screenshots and a short `MATCH_GRID_UX_POLISH_HANDOFF.md` update: tests, changed files, design decisions, risks and remaining tasks. Request owner visual acceptance before any production release.

---

## MG-UX1 implementation — READY FOR OWNER VISUAL ACCEPTANCE

Status: **implemented on `mg-ux1/match-grid-polish`, draft PR open, not merged, not deployed.**
Base stays `4b13c042` (+ the scope commit `d7ff0aa9`). `origin/main` has since moved to `7be45341`
(Daily mobile header, PR #11): 9 Daily-only files, no overlap with Match Grid or the Ranked arena.

### What changed (frontend only)

| file | change |
|---|---|
| `src/lib/match-grid/layout.ts` | New `planBoard()`: one plan per round (composition, sigil/seal sizes, caption form, well grid, the ledger's reserved room) from the module width, the stage budget (`maxHeight`) and the dealt names. Caption sizing from measured Inter 600 advance widths (`estimateTextWidth`, `captionFits`). Constellation fan rebuilt from caption width (`constellationGeometry`). Ledger arrangements (`ledgerFit`: rich / medium / compact). |
| `src/components/match-grid/MatchGrid.tsx` | Uses the plan; name plate; drop-target highlight; landing pulse; Lock readiness + seated count; empty-well note; new ledger (exact plate / corrections-only list); status wording. |
| `src/components/match-grid/matchGrid.css` | Caption / seal-name typography from plan variables; rows composition; rail footer (prompt above status); feedback styles; ledger rewrite. All new motion is off under reduced motion. |
| `src/components/match-grid/MatchGrid.test.tsx` | Reveal wording updated; 7 new tests (hover / hold / settled-tap naming, drop target by geometry, landing pulse, Lock readiness + empty well, no verdict leakage from any new feedback). |
| `src/lib/match-grid/layout.rail.test.ts` | Rewritten for the plan: every arena budget × 3/4/5 trees fits, ≥44 px targets, no sigil/caption collisions (3 seats per tree), sockets inside the well, ledger room reserved; phones (3-tree board no taller than M1's 494 px); constellation fan clearance. |
| `e2e/match-grid-arena-continuity.spec.ts` | Hit test made viewport-aware: `elementFromPoint` returns null below the fold, so off-screen targets are counted as `offscreen` (annotated) instead of "covered by null". Size/shrink checks still apply to every target. |
| `docs/audits/mg-ux1/*.jpg` | 18 before/after composites (real arena, real backend). |

Untouched: `matchGridModule.tsx` (host seam, `useStageRoom`, answer secrecy), `board.ts`, `reveal.ts`,
`contract.ts`, the shared Ranked HUD / results / CanonicalArena, every backend file, bots, timers,
points, question generation, server grading.

### Design decisions

1. **Rune readability.** Captions are 10–11 px (was 8.5 px / 58 px) and never wider than the pitch to
   their neighbour, so they cannot touch. Rows reserve two lines where the budget allows (every certified
   name sets in two lines from 82 px at 10.5 px; "Transcendence" is the binding word). Where a dense
   frame can only afford one line (1280×600, five trees) the caption ellipsizes and the **name plate**
   gives the full name: mouse hover, keyboard focus (`:focus-visible`), the sigil in hand (tap/hold on
   touch), a drag in flight, and a tap on a locked/settled board. The plate is `pointer-events: none`
   and `aria-hidden`; the sigil's accessible name already carries the full name. Targets stay ≥44 px.
2. **Teaching reveal.** The ledger lives in the well's footprint, which is **reserved at open** for the
   worst case (every rune corrected), so it never resizes the frame and never scrolls or clips. Exact
   board: one concise plate ("Perfect classification · All N runes in the right rune tree"), the settled
   board stays fully visible. Wrong board: **only the corrected runes**, each as `Name` + `Was → Belongs`
   (strike-through on the wrong tree, the right tree in its hue), plus Keystone/Minor when there is room
   (rich mode). Mode is chosen per box: rich (3 lines) → medium (2) → compact (1).
3. **Board geometry.** Three trees keep the **constellation** wherever it fits the budget; its fan is
   now derived from caption width (shoulders sit just outside the top seat's sigil and below its caption),
   which removed the shoulder/neighbour collisions. Four and five trees (and three on short frames) use
   the **rail**: rows left, well right, both as tall as the stage allows (rows breathe up to +24 px), the
   prompt moves into the footer above the status line so the whole board height goes to rows and well.
   Tree names sit under their seal (10 px small caps, was 8.5 px riding on the wire). Phones use stacked
   rows with two-line captions. The plan is fixed per round, so open → lock → reveal never moves the frame.
4. **Interaction feedback.** Held sigil: brass orbit + name plate + status "Holding X — tap a rune tree,
   or press 1–K". While anything is in hand every seal shows the same dashed "offer" ring; during a drag
   the seal (and row/column zone) under the pointer is highlighted — by geometry only. A landing rings
   the seal once and flashes the sigil. Lock shows `seated/N` until complete, then turns bright and
   breathes ("All N seated — lock in when you are sure").
5. **Polish.** Empty well says "All N seated" in its own footprint; status wording names progress
   ("3 of 7 seated · 4 runes unsorted"); prompt/status sizes per composition.

### Answer secrecy / accessibility (unchanged guarantees)

No new element carries correctness before the reveal: the drop target, offer rings, landing pulse,
plate and Lock readiness depend only on pointer geometry and the player's own board (unit-tested:
the pre-reveal DOM still contains no `canonical|correct|misplaced|wrong`). Drag, tap→tap, digits 1–K,
Delete, Escape, arrow-walking seals and the live region are unchanged. All new animation is removed
under `data-reduced-motion` / `prefers-reduced-motion`; landing/pulse elements are invisible without it.

### Phone decisions (from the browser suites)

The first branch run of `match-grid-arena-continuity` failed 4/12 on phones (main: 12/12): Lock moved
19 px as its new `seated/N` count changed its width, and the taller phone board put runes below the
fold. Fixed: Lock has one fixed width per composition; phone rows carry no padding, the header/footer/
gap are tighter, the phone well keeps four columns and the phone ledger lays corrections out in two
columns, so a three-tree phone board is **494 px, exactly M1's height** (four trees 565 px vs 560; five
708 px vs 626 — five-tree phones scroll a little more, as 360×640 already did). After the fixes: 12/12.

### Measured results (real arena, local real backend, headless shell)

`before` = clean main `4b13c042`, `after` = this branch; same harness, same viewports, plan A
(round 1 exact, round 2 half wrong, round 3 all wrong; plan B mirrors it). Columns: composition;
truncated captions / captions on the open board; caption collisions (caption over caption or over
another sigil) on the full board; correction cards clipped / listed in the reveal; module share of the
stage; smallest caption / tree-name font (px).

| viewport | trees | composition | truncated | collisions | ledger clipped | stage use | type |
|---|---|---|---|---|---|---|---|
| 1920x1200 | 3 | constellation → constellation | 0/7 → 0/7 | 2 → 0 | 1/3 → 0/0 | 46% → 46% | 10.5/11.5 → 11/12.5 |
| 1920x1200 | 4 | ledger → ledger/rail | 4/8 → 0/8 | 4 → 0 | 0/4 → 0/4 | 57% → 41% | 8.5/8.5 → 11/10 |
| 1920x1200 | 5 | ledger → ledger/rail | 2/10 → 0/10 | 5 → 0 | 6/10 → 0/10 | 64% → 50% | 8.5/8.5 → 11/10 |
| 1600x900 | 3 | constellation → constellation | 1/7 → 0/7 | 2 → 0 | 1/3 → 0/0 | 58% → 65% | 10/10.5 → 11/12.5 |
| 1600x900 | 4 | ledger → ledger/rail | 6/8 → 0/8 | 4 → 2 | 0/4 → 0/4 | 75% → 58% | 10/8.5 → 11/10 |
| 1600x900 | 5 | ledger → ledger/rail | 4/10 → 0/10 | 5 → 0 | 6/10 → 0/10 | 83% → 80% | 10/8.5 → 11/10 |
| 1280x720 | 3 | ledger/rail → constellation | 4/7 → 0/7 | 4 → 0 | 1/3 → 0/0 | 48% → 75% | 10/8.5 → 10/10.5 |
| 1280x720 | 4 | ledger/rail → ledger/rail | 7/8 → 0/8 | 6 → 0 | 2/4 → 0/4 | 50% → 86% | 10/8.5 → 10.5/10 |
| 1280x720 | 5 | ledger/rail → ledger/rail | 7/10 → 0/10 | 7 → 0 | 7/10 → 0/10 | 61% → 85% | 10/8.5 → 10.5/10 |
| 1366x650 | 3 | ledger/rail → ledger/rail | 3/7 → 0/7 | 4 → 0 | 1/3 → 0/0 | 56% → 78% | 10/8.5 → 11/10 |
| 1366x650 | 4 | ledger/rail → ledger/rail | 7/8 → 0/8 | 5 → 2 | 2/4 → 0/4 | 58% → 84% | 10/8.5 → 10.5/10 |
| 1366x650 | 5 | ledger/rail → ledger/rail | 4/10 → 0/10 | 7 → 0 | 7/10 → 0/10 | 70% → 84% | 10/8.5 → 10/10 |
| 1280x600 | 3 | ledger/rail → ledger/rail | 5/7 → 0/7 | 4 → 0 | 1/3 → 0/0 | 63% → 83% | 10/8.5 → 11/10 |
| 1280x600 | 4 | ledger/rail → ledger/rail | 4/8 → 0/8 | 4 → 0 | 2/4 → 0/4 | 65% → 84% | 10/8.5 → 10/10 |
| 1280x600 | 5 | ledger/rail → ledger/rail | 5/10 → 5/10 | 5 → 0 | 7/10 → 0/10 | 79% → 83% | 10/8.5 → 10/10 |
| 390x844 | 3 | ledger → ledger | 5/7 → 0/7 | 4 → 0 | 0/3 → 0/0 | 72% → 72% | 10/8.5 → 10/9.5 |
| 390x844 | 4 | ledger → ledger | 4/8 → 0/8 | 4 → 0 | 2/4 → 0/4 | 82% → 83% | 10/8.5 → 10/9.5 |
| 390x844 | 5 | ledger → ledger | 8/10 → 0/10 | 5 → 0 | 8/10 → 0/10 | 91% → 92% | 10/8.5 → 10/9.5 |
| 360x640 | 3 | ledger → ledger | 5/7 → 0/7 | 4 → 0 | 1/3 → 0/0 | 90% → 90% | 10/8.5 → 10/9.5 |
| 360x640 | 4 | ledger → ledger | 6/8 → 0/8 | 5 → 0 | 2/4 → 0/4 | 91% → 91% | 10/8.5 → 10/9.5 |
| 360x640 | 5 | ledger → ledger | 7/10 → 0/10 | 5 → 0 | 8/10 → 0/10 | 91% → 91% | 10/8.5 → 10/9.5 |

Totals over all 30 boards (plans A+B): truncated captions **144 → 10**, collisions **136 → 4**, clipped
corrections **89 → 0**. The 10 remaining truncations are all the 1280×600 five-tree deals (one-line
captions; name plate). The 4 collisions are boards where the harness put a 4th rune on one tree
(the overflow seat sits between two seats; the deal never does this). Every reveal reached the
`ledger`/`done` stage 1.31–1.84 s after the reveal arrived (the reveal clock is unchanged; the spread is harness polling); targets ≥ 44 px with 0 hit-test misses on every
on-screen board; page never scrolls horizontally; module never overflows the stage.

Stage use rises sharply on 1280–1366 px desktops (48–70 % → 75–86 %). On tall desktops (1600×900,
1920×1200) four/five-tree boards now use **less** height than main's stacked layout: that layout filled
the height with 8.5 px captions; the rail stops growing once every name is set (rows breathe at most
+24 px). Flagged for visual acceptance (see remaining items).

### Test evidence

| check | main `4b13c042` | branch |
|---|---|---|
| vitest (`ranked-core`, `ranked-public`, `ranked-arena`, `match-grid` ×2, `quiz/workspace`, `admin/ranked`, `quiz-ranked`) | 3275 passed / 11 failed | 3300 passed / 11 failed — **identical failure set** (none in Match Grid) |
| match-grid unit set (`MatchGrid`, `layout.rail`, `board`, `matchGridModule`, review card, launch) | — | 128 passed |
| `tsc -p tsconfig.app.json` | 2 errors | same 2 (OnboardingProfile, identity/connections) |
| eslint (changed files) | — | 0 errors (1 pre-existing warning in `RuneTreeGlyph.tsx`) |
| `match-grid-arena-continuity` (`MG_REQUIRE_SETTLE=1`, 6 viewports × motion) | 12/12 | 12/12 (after the phone fixes; first run 8/12, see above) |
| `match-grid-live-release` (8 cases, real scoring oracle) | 8/8 | 8/8 |
| MG-UX1 capture harness (10 viewport/plan cases, 30 boards) | 10/10 | 10/10 |

Notes: `origin/main` moved to `7be45341` during the work (Daily mobile header only; no shared files).
Two capture cases once missed a round-1 reveal (locked → next deal) during a run that was interrupted
by a session restart; they did not reproduce in the two later runs, and main's live suite shows the
same server path is sound. Environment as in MATCH-GRID-LIVE: local backend at master `f12a7432` on a
disposable copy of the 2026-09-26 production snapshot, HS256 test persona, headless shell 1228.

### Screenshots (`docs/audits/mg-ux1/`, before | after)

`1280x720-3tree-full`, `1280x720-3tree-reveal-perfect`, `1280x720-4tree-held`, `1280x720-4tree-reveal-wrong`,
`1280x720-5tree-full`, `1280x720-5tree-reveal-wrong`, `1366x650-5tree-full`, `1280x600-4tree-full`,
`1280x600-4tree-reveal-perfect`, `1280x600-5tree-reveal-wrong`, `1600x900-3tree-full`, `1600x900-5tree-full`,
`1600x900-5tree-reveal-wrong`, `1920x1200-4tree-full`, `390x844-4tree-full`, `390x844-3tree-reveal-wrong`,
`390x844-5tree-reveal-wrong`, `360x640-3tree-held`.

### Remaining items / risks (none touch scoring, bots or the server)

1. **Owner visual acceptance** of the rail on tall desktops: if the board should keep growing on
   ≥ 900 px stages, raise the rows' breathing cap or allow 58 px sigils in `railPlan` (one-line change each).
2. 1280×600, five trees: one-line captions; long names (≈ half the roster) are completed by the name plate,
   and compact correction rows may shorten a long rune name (never the tree it belongs to).
3. A 4th+ rune on one tree uses the overflow seat between two wire seats: legible, but captions overlap.
4. Five-tree phone boards are ~80 px taller than main's (page scrolls a little more to Lock).
5. The name plate is a visual aid only (`aria-hidden`); screen readers already get the full name from
   the sigil's accessible name. The Lock `seated/N` pill is `aria-hidden` too (status line carries it).
6. Shared arena items noticed but out of scope: none new.


---

## Command Center checkpoint — PR #30 (2026-10-14 Pacific)

- Draft PR: https://github.com/mitcherrman/mogsy/pull/30
- Current-main integration parent: `d3629f55db9a216ff16512d237171493bf0e1acb`
- Integration commit: `1fb9d645ce887a68fd77bd863754c65123be95b0`
- Original finished work: `36fb2e075fbefaf9e9e1feb1394236725668258b`
- Six changed implementation/test files have identical blob hashes on current main and old baseline `4b13c042`; exact polished versions were transplanted without shared-host edits. GitHub compare verifies only 25 files changed (six code/test, 18 audits, this handoff), one commit ahead and zero behind as of initial PR verification.
- **CI status:** No GitHub Actions runs or commit statuses were returned for the integrated SHA at the time checked. This is **not** a successful validation result. Browser/regression certification on the new shared arena remains open. The connector execution environment cannot directly clone github.com and run npm/Playwright.
- **Deployment:** not merged or published. No new backend migrations or data changes. Owner visual acceptance and a new-baseline test result remain required before release.
- **Next:** run focused Vitest/ESLint/typecheck, Match Grid continuity (12) and live-release (8) on this exact branch/current backend; inspect 360×640, 390×844, 1280×600 five-tree and tall-desktop viewport output, and confirm answer secrecy and grading. Review PR #30 before merge.


---

## Command Center validation addendum — 2026-10-14 / PR #30

**Verified new-main code base:** `d3629f55db9a216ff16512d237171493bf0e1acb`. Polished Match Grid and layout blobs transplanted without conflicts from `36fb2e07` (other modes inherited untouched). PR #30 is still draft, unmerged, unpublished.

**New integration CI added:** `.github/workflows/match-grid-ux-integration.yml` runs on Match Grid edits, using Node 22, an ephemeral npm install, 120 focused Vitest tests including the Ranked Match Grid module, lint on modified sources/tests, Vite production build, and the self-contained original DEV Match Grid continuity Playwright matrix (12 desktop/phone normal/reduced motion cases + pre-lock answer-leak assertion). No database, production secrets, or Docker used.

- First CI run [38689544213](https://github.com/mitcherrman/mogsy/actions/runs/38689544213): 120 unit tests, lint and build **PASS**; browser job **FAILED 12 of 13** because the original M1 DEV sampler kept recording the *intentional Next-board reset* and saw a new round with a different planned height while React's phase still briefly read `revealed`. Failures were exclusively a size change `revealed/done → revealed/freeze` after clicking Next (35-77 px). This is not evidence of an in-round reveal jump.
- Narrow test correction commit `fd2c14cdd12228b79ae4047c80bf79fa2a3a2e70`: stop the frame sampler **after the prior reveal reaches done, before pressing Next**; separately click Next and assert new board opens, with page overflow check. This retains the ≤1px within-round continuity assertion for all sampled frames; no production component, styling or gameplay changes.
- Second CI run [38690032862](https://github.com/mitcherrman/mogsy/actions/runs/38690032862): **SUCCESS** for both jobs. **120/120** Vitest tests, lint, production Vite build and **13/13** Chromium cases (12 viewports/motions + pre-lock no-correctness DOM) passed. This run was on code commit `fd2c14cd`; subsequent documentation-only edits need no runtime recertification.

**Still not proven by CI:** `e2e/match-grid-arena-continuity.spec.ts` and `e2e/match-grid-live-release.spec.ts` need a real disposable authenticated backend and local score oracle; these are skipped absent the test secrets/config and have **not** been re-run against post-Role production main. Original worker evidence (12/12 and 8/8 respectively) remains historical old-base data. Do not claim live owner-match certification from the green DEV CI. Also require owner visual approval of tall desktops and five-tree phone/short desktop screenshots before merge.

**Next:** owner reviews `docs/audits/mg-ux1/` and gives explicit visual approval or adjustments; engineering either executes current-base real-backend acceptance in a suitable connected runner or documents a conscious owner-approved exception before shipping; merge/publish only after gate resolution, then exercise a real owner account. No publication from this PR yet.

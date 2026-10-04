# VISCONT1 on current main (`7c699a9a`) + F1 media-aware answer density — release candidate

**Authoritative.** This supersedes the integrations onto `30b1266f` (`viscont1/integration-current-main`, tip `dfc11731`), `dab1eeb7` and `2a434c2b`; those are history only. The design, the contract and the production-font derivation (B1) are in `VISCONT1_HANDOFF.md`.

| | |
|---|---|
| Branch / worktree | `viscont1/f1-media-density-current-main` / `.worktrees/viscont1-f1` |
| Base | `origin/main` = **`7c699a9a`** (PATCHHUB-PH1). Fetched before starting; the after-test check is under "Final origin/main check". |
| Replay | `3be364d0` → **`e7e06ab7`**, `4debd606` → **`2467cb92`**, `9bf348d8` → **`200f8afd`** |
| F1 | **`a37ae99c`** |
| Docs | this file + `VISCONT1_HANDOFF.md` (the SSM section carried from `dfc11731`, its header re-pointed here), in the commit on top of `a37ae99c` |
| State | Committed locally. **Not pushed, not published, not deployed, `main` untouched.** No backend change. |

## Base and replay
- **`30b1266f..7c699a9a`** is 4 PATCHHUB-PH1 commits and 22 files. Every file is in Patch Reports (`src/components/patch-reports`, `src/lib/patch-reports`, `src/pages/lol/PatchReports*`, `docs/PATCH_HUB_REPORT_HANDOFF.md`). They share **no file** with VISCONT. The three VISCONT code commits cherry-picked cleanly.
- **Patch identity.** `git patch-id --stable`, per file, `30b1266f..9bf348d8` against `7c699a9a..200f8afd`: **all 11 files are identical**, including the probe. The stale docs (`dfc11731`, `ed66283f`, `7f2d6921`) were not replayed.
- **Patch Hub untouched.** `git diff 7c699a9a HEAD` over every Patch Report path is empty. The Patch Report unit suites pass identically on both trees (see the differential).

## F1 — root cause (measured)
Phase 1 final certification F1: the real item-graph round `quiz:item_component_v2:Dead Man's Plate:Chain Vest` ("Which item is a component of Dead Man's Plate?", whose 24-character option is "Ionian Boots of Lucidity"), and Daily's "What can Giant's Belt build into?" (19-character "Chempunk Chainsword"). Each option carries its inline item icon.

- **Classification ignored the icon.** `answerDensity()` tiered on characters only. With normal ≤ 24, the 24-character label got the arena's full 15px type.
- **The icon slot is fixed.** It is `OptionMediaIcon`: 28px icon + 8px gap = **36px of label width on every tablet, at every width**. The probe measured each tablet's label line with and without it:

| width | label line, no media | with media | slot cost |
|---|---|---|---|
| 360 / 375 phone | 240 / 255 | 196 / 211 | 15–18% |
| 1024 | 144.7 | 100.7 | 30% |
| 1280–1599 | 196.5 | 152.5 | **22%** |
| 1600+ | 246.9 | 202.9 | 15% |

- **The label wrapped.** At 1280 the tablets grew 42.4 → **66.8px** and the answers overflowed their 128px reserve by **15.5px**. At 1440 the tablets were 78.8px (14px padding) and the overflow **39.5px**. The stack yielded the art, so the media bottom, prompt and answers moved up.
- **The text-only twins** (the same characters with no icon) stay on one line and do not move.
- **At 1600+** the 1-line media tablet is 66px (the icon sets the height); it fit by 2px. **Phones** have one column and 48px tablets with room to spare.

**Capacity sweep.** The longest label that fits the answer reserve for every sample of that length: item names, stat lists and champion/rune names, at 14 offsets × 4 tablets, 4-answer 2×2:

| width | normal, text / media | long, text / media | dense, media |
|---|---|---|---|
| 1024 | 28 / 21 | **37** / 29 | 46 |
| 1280, 1366, 1440 | **23** / **16** | 43 / **28** | ≥56 |
| 1520, 1600×700 | 28 / 24 | 56 / 46 | ≥56 |
| 1600×780+ | 28 / 24 | 56 / 46 | ≥56 |
| 360 / 375 | 30 / 25 | 56 / 46–51 | 51 / ≥56 |

- **No constant icon penalty works.** The slot costs about 7 characters on one line (23 → 16) but about 15 once a second line compounds it (43 → 28).
- **The sweep also exposed a latent text-only gap** on the same seam. The old bound of 24 was one character generous at 1280–1499 (23 fits), and the old 40 was three generous at 1024 (37).

## The rule (shared, structured, pre-layout)
`answerDensity(labels, { optionMedia })` (`src/lib/question-surface/textDensity.ts`) picks between two measured bound tables. Each bound is the binding capacity minus one character of margin:

| | normal | long | dense |
|---|---|---|---|
| text only (`ANSWER_DENSITY_BOUNDS`) | **≤ 22** (was 24) | **≤ 36** (was 40) | beyond, up to the bank's 76 |
| with option media (`MEDIA_ANSWER_DENSITY_BOUNDS`) | **≤ 15** | **≤ 27** | beyond; holds to 46 (1024), past any icon-bearing entity name (~25) |

- **One predicate.** `AnswerGrid` computes `hasOptionMedia = options.some((o) => o.media)` once. That same value drives both the inline-slot render (`optionMedia`) and the tier, so the two cannot disagree. RA6 media is all-or-nothing per question, and every tablet holds the slot.
- **Nothing else.** No CSS, reserve, padding or geometry changed. The existing tiers' type applies: long is 14px / 1.35 with 7px padding on desktop and 13px / 1.3 on phones; dense is 12px. There are no entity, family, question or category checks, no DOM measurement, no ResizeObserver, no clamp, clip or animation, and no answer-region enlargement.
- **Readable.** The real F1 sets draw at **14px** on desktop (13px on phones) in two lines; nothing is clipped. Short media sets (≤15) keep the full 15px.

**Continuous check under the real classifier.** Every label length 4–56, with and without media, at 12 widths:
- **All fit**, except media labels at 1024 (46, item names) and 360 (51, stat lists). Those are the dense-media limit, well past real icon labels.

## Fixtures (dev probe, `?lol=1` production face)
Real entity-shaped rounds use the same `option_media` payload shape and inline icon as production, with an item premise card:

| fixture | what |
|---|---|
| `f1ChempunkText` | text-only control: the 19-character Chempunk set with no icons |
| `f1Chempunk` | the same labels with icons (also the "Chempunk Chainsword" shape) |
| `f1IonianText` / `f1Ionian` | the exact Dead Man's Plate round, without / with icons |
| `f1Locket` | a 25-character icon label ("Locket of the Iron Solari") |
| `shape.15.4.60.1.1` / `shape.16.4.60.1.1` | just below / just above the media normal bound |
| `shape.27.4.60.1.1` / `shape.34.4.60.1.1` | the long / dense side of the media long bound |
| `shape.24.3.60.1.1`, `shape.24.2.60.1.1` | 3- and 2-answer media sets |
| existing `realP99`, `realMax`, `shape.76.4.60.0`, `shape.22/23.4.60.1.0` | no-media long/dense, and both sides of the text bound |

`shape.N.K.M.R.O`: the new `O` (`om=1`) puts item icons on every option and cuts the labels from real item names.

## Geometry: before (`200f8afd`, VISCONT without F1) → after (`a37ae99c`)
Shown as media top/bottom · prompt top · answers top · first-tablet height · answer overflow:

| viewport | `opts4` reference | `f1Ionian` / `f1Chempunk` before | after |
|---|---|---|---|
| **1280×800** | 58.4/314.4 · 322.4 · 460.4 · 42.4 | 58.4/**302.2** · 310.2 · 448.2 · **66.8** · **+15.5** (moved **12.2**) | 58.4/314.4 · 322.4 · 460.4 · 53.8 · −10.4 (**0.0**) |
| **1440×900** | 92.4/368.4 · 380.4 · 522.4 · 54.4 | 92.4/**360.2** · 372.2 · 514.2 · **78.8** · **+39.5** (moved **8.2**) | 92.4/368.4 · 380.4 · 522.4 · 53.8 · −10.4 (**0.0**) |
| 375×812 | 155.7/279.7 · 287.7 · 419.7 · 48 | unchanged (0.0) | unchanged (0.0); 13px |
| 1880×900 | 74.6/378.6 · 390.6 · 552.6 · 62.4 | 66 · −2 (0.0; fit by 2px) | 44 · −46 (0.0) |

- **Overflow is identical** to the certification's real-match numbers: +15.5 at 1280 and +39.5 at 1440, with tablets 66.8 and 78.8.
- **Movement differs slightly.** The probe moved 12.2 / 8.2px, against 14.2 / 10.2px in the real `/quiz/ranked` host. The host and its HUD differ; the cause and the overflow are the same.
- **After the fix, both are 0.0.**

**All nine viewports, after.** Fixtures: `opts4` plus every F1 fixture, the media boundary pair, the 3- and 2-answer media sets, the text boundary pair, `realP99`, `realMax` and `shape.76`. Result: **spread 0.0px** on every anchor (folio top/bottom, media top/bottom, prompt top, answers top, first tablet, Module Rail where present), **no answer overflow** (worst −2px), and **page scroll 0** at 360×740, 375×812, 1024×768, 1280×800, 1440×900, 1600×780, 1880×900, 1920×800 and 1920×1080.

**Daily-hosted** (`?host=daily`, as `DailyRunPage` hosts a stage; Standard, Time Trial and Survival): `opts4`, `f1ChempunkText`, `f1Chempunk`, `f1Ionian` and `f1Locket` show **spread 0.0** with no overflow and no scroll at 375, 1280, 1440 and 1880.

## Mutation proof
With the fix in place, `answerDensity` was temporarily restored to the pre-F1 behaviour (bounds 24/40, media ignored), and the F1 block was run. **9 / 9 fail.**
- **At 1280×800 and 1440×900 it fails on geometry:** "f1Chempunk: the answers overflow their box by **15.5px**" and "**39.5px**".
- **At the other seven viewports it fails on the tier assertion** (`f1Chempunk tier`). The geometry assertions run first, so the geometry failure is the one reported wherever there is movement.

The fix was then restored, byte-identical (`cmp`).

## B1 (long prompts) — still green
In the production face, `stressA` (188), `family` (192) and `ssm212`, `ssm218`, `ssm224` and `ssm228` against `opts4` give **spread 0.0px and page scroll 0 at all nine viewports**. The 228 is set in Inter 15/1.15 on phones and Cinzel 16–20px on desktop, as certified. The continuity spec's B1 block (9 viewports) passes. No prompt rule changed.

## Certification on `a37ae99c` vs untouched `7c699a9a`
Windows, vitest 3.2.7, Playwright Chromium. Servers:
- **:5371** served `.worktrees/viscont1-f1`; `/@vite/env` reported `a37ae99c6195`.
- **:5372** served a clean detached `.worktrees/viscont1-f1-base` at `7c699a9a`; it reported `7c699a9ae649`.

Identity was read after the runs too. The Journey e2e ran on dedicated `--mode e2e` servers (:5391 / :5392) started by throwaway configs with `reuseExistingServer: false`. Every throwaway config and harness was uncommitted and removed.

| | suite | `a37ae99c` | `7c699a9a` |
|---|---|---|---|
| 1 | `ranked-visual-continuity` (9 viewports, production face) | **116 / 116** (the 98 before, plus the 9-viewport F1 block and the live F1 sequence) | n/a (VISCONT's spec) |
| 2–3 | `ranked-arena-fit` + `ranked-result-fit` + `ranked-outro-axis` | 449 passed, 1 failed | 449 passed, 1 failed. **Identical by test name.** The only failure on both is `RMOB2 compact phone HUD › is 40px tall`. |
| 4–5 | QuestionStageGeometry + textDensity | all VISCONT / F1 tests pass; 4 fail | the same 4 names fail |
| 6 | Stat Check LVL 11 → none → LVL 20 (in 1) | **9 / 9** | — |
| 7 | Order Forge browser (`Order Forge` + `OF4`, incl. OF4-CONTINUITY) | **44 / 44** | 44 / 44 |
| 7 | Order Forge units: `OrderForge`, `orderForgeModule`, `orderForgeLockReveal`, `orderForgeBotLock`, `orderForgeReveal`, `orderForgeContinuity`, `OrderForgeLaunch`, contracts | all pass | all pass |
| 8 | Journey Library e2e (`e2e/jlib`: library + host) | **7 / 7** | 7 / 7, identical names |
| 8 | Journey Library units (`journey-library`, `quiz-journeys`, `App.journeyLibraryRoute`, `RankedMatchRow.host`, `matchHost`, `QuizRankedPage.journeyOrigin`) | all pass | all pass |
| 9 | Journey `/dev/journey-arena?capture=zed&step=1..8` × 1880×900 / 1280×800 / 375×812: animations paused, rect + 12 computed properties, 455–508 elements per state | **24 / 24 identical to `7c699a9a`** | (reference) |
| 10 | unit sweep, 1297 files at `--maxWorkers=2` (ranked-arena, question-surface, quiz incl. QuizAnswerOptions, quiz-ranked, quiz-daily-challenge, quiz-journeys, quiz-broadcast, interaction-grammar, ranked-core, ranked-public, journey-library, probe, analytics, Quiz.hub, **patch-reports, pages/lol**) | 4498 passed / 29 failed | 4463 passed / 29 failed. **The same 29 names.** |
| 11 | `tsc --noEmit -p tsconfig.app.json` | 6 errors | **identical 6** |

**The 29 failures common to both trees**, none caused by this work:
- `QuestionTimeline` MALT B1 ×14;
- Windows source-text scans: `AnswerGrid.elimination` ×2, `DailyOnCanonicalArena.boundary` ×2, `QuestionStageGeometry` ×4, `CanonicalArena.boundary` ×1, `masterySliceModule.visualLanguage` ×2;
- `playModeCard.styles` ×2;
- `QuestionMotifLayer.qf1` ×1;
- `Quiz.hub` "exactly one h1" ×1.

**No new failure name in any suite.**

**One test-harness fix in `a37ae99c`.** The continuity spec's production-face wait (`expectProductionFace`, from VISCONT1-SSM) passed an object-returning predicate to `waitForFunction`. An object is always truthy, so the bounded wait never waited. It surfaced as a one-off "Cinzel did not load" on a cold first round, and now waits on the boolean.

## Real-content reproduction against the backend: not run
The certification's real-match harness (`docs/phase1-final-cert/data/live.cjs` + `mkmatch.py`) drives `/quiz/ranked` against the frozen backend `3ca8fa85` on a scratch DB copy, signed in as locally minted test personas (HS256 with the e2e test secret).

**This pass did not run it.** The tool permissions blocked reading the backend's persona-minting helper, so no persona tokens could be produced. It was not worked around.

**What stands in for it:**
- The probe serves the **exact real payload**: the same prompt, the same four options, real item ids and icons, the item premise card, and backend-shaped `option_media`.
- It runs through the production `QuizRankedMatch` controller in Ranked and in the Daily host.
- It reproduces the certification's tablet heights and overflow exactly before the fix, and holds 0.0 after.

A scratch DB copy is staged in this session's scratchpad if the owner allows the live run.

## Out of scope (unchanged)
- The SSM "18 + 20 = 38" rationale not reaching `projectSurfaceReveal → conciseEvidence` is a separate audit. No reveal or evidence contract was touched.
- No Patch Report, Journey, Order Forge, Ranked logic, backend or canonical data change.

## Final origin/main check
`git fetch` after all testing (2026-10-04): `origin/main` = **`7c699a9a`**, unchanged — no commits since the base, so nothing to evaluate.

## Readiness
**Ready for targeted final cross-repo recertification** of F1 and B1 against backend `3ca8fa85`, on base `7c699a9a` (re-verified unchanged after testing).
- All 14 F1 acceptance points hold in the probe and differential certification.
- The one item left to the certifier is the live-backend item-graph replay, which this pass could not run (see above).

Inherited, not caused by this work:
- `RMOB2 compact phone HUD` 40px;
- the Windows source-scan unit tests;
- `QuestionTimeline` MALT B1;
- `playModeCard.styles`, `QuestionMotifLayer.qf1` and `Quiz.hub`;
- I1–I3 from the Phase 1 certification.

`pnpm build` was not run (it prerenders).

---

## Update: fast-forward onto current main `cceae3ea` (authoritative)

Branch `viscont1/f1-current-main-final`, worktree `.worktrees/viscont1-f1-cmfinal`.
Local only: no push, no publish, no deploy.

**Base.** `origin/main` = `cceae3ea1e4b8e4c889ebf1e3c92a90c502f071a`. Verified
after fetching, before replay and again at the end.

**Replay.** Only the four code commits were cherry-picked (`-x`), in order, with
no conflicts. `git patch-id --stable` matches each original:

| old | new | patch-id |
|---|---|---|
| `e7e06ab7` | `8209cd40` | `95a5e0e06b38` |
| `2467cb92` | `6eaf7517` | `f6554844ffd1` |
| `200f8afd` | `5c716868` | `137680efd074` |
| `a37ae99c` | `5f65d210` | `b7a82d70c873` |

**Upstream delta.** `7c699a9a..cceae3ea` is 8 commits: the Extended Journey
fixtures, `journey/adapter.ts` and `j3.ts`, the admin Extended Journey launch,
`rankedResultsModel`, the Quiz hub/admin wiring, and League Docs Jhin
attack-speed. They share **no file** with VISCONT/F1's 11 files.
`git diff a37ae99c <candidate>` is exactly the upstream file set, so no
current-main file was lost or reverted.

**F1** (`ranked-visual-continuity` F1 block, production face, the server confirmed
serving `5f65d210`): 375x812, 1280x800, 1440x900 and 1880x900 **pass**.
Every anchor holds within 0.5px. Prompt and answers do not overflow, no label
is clipped, and page scroll is 0. The block covers `f1Ionian` (Ionian Boots of
Lucidity plus icon), `f1Chempunk` (Chempunk Chainsword plus icon), their
text-only twins, `f1Locket`, and the shape boundary pairs.

**B1** (the ssm212–228 production-font block): 375x812, 1280x800 and 1880x900
**pass**, within 0.5px with no phone scroll.

**Extended Journey smoke.**
- Current-main focused tests (`masterySliceModule.extended`,
  `ExtendedJourneyLaunch`, `AdminShell.areas`, `rankedResultsModel`): 92/92 pass.
- The real 11-child `jext-ashe-jinx` capture was walked in
  `/dev/journey-arena`. All 51 snapshots progress monotonically through
  STEP 1..11 OF 11 and end at `finished` with "Mastery Slice complete" and
  segment scoring. There were no console errors.

**Focused units.** textDensity passes. QuestionStageGeometry: 97 of 101 pass.
The 4 failures (Match Header left block, server boundary, tablet box, arena
footprint class) fail by the same names on untouched `cceae3ea`.

**tsc.** Errors in `OnboardingProfile.tsx` (2), `identity/connections.ts` (2)
and `practiceLeaveContract.test.ts` (8). They are identical on untouched
`cceae3ea`.

**Final origin/main:** `cceae3ea`, unchanged.
**Ready for the final targeted release recertification.**

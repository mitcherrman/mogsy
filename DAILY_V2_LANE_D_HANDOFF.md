# Daily V2 — lane D handoff (existing interaction reuse proof)

**State: READY for E.** The work is committed locally on `daily-v2/d-mode-reuse-fe`. It is not pushed, has no PR, and no central file was edited.

| | |
|---|---|
| Worktree | `C:\Users\mlmit\OneDrive\Desktop\mogsy\.worktrees\daily-v2-d` (`node_modules` = junction to the primary checkout) |
| Branch / base | `daily-v2/d-mode-reuse-fe` from FE main `9ca661186954fca615cedc5295d4f9d51b7fb4fa` |
| Backend read | `League_Combat_Simulator` `origin/master` `a018bc0ccfbebc72c4f4f50c0ac15ffedbe83ffa`, read only via `git show` / `git grep` |
| Spec | `MOGZY_DAILY_V2_THREE_ACTS_SPEC_2026-10-20.md` was **not available**. Spec-dependent points are open questions (section 7) |

## 1. Files (all new)

| File | What |
|---|---|
| `docs/DAILY_V2_REUSE_MATRIX.md` | Compatibility table per mode (canonical source → module/version → config → segment_state → FE renderer → graded response → frozen ref → timer), readiness gaps, owner decisions, open questions |
| `src/lib/daily-v2/adapters/modeReuse.ts` | Daily V2 allow-list of `(module_id, version)` pairs (`quiz@2`, `item_cost_duel@5`, `order_forge@2`, `mastery_slice@2`). `rendererForDailyV2Segment` delegates to the registry's `getModuleRenderer` and returns `null` for any other pair. No renderer code |
| `src/lib/daily-v2/adapters/modeReuse.test.ts` | One contract probe per mode on real captures and fixtures, plus fail-closed checks (14 tests) |
| `src/lib/daily-v2/adapters/statDropHost.ts` | **Proposed** Stat Drop host contract: public block reader (refuses answer keys and malformed scales), reveal reader (server `outcome`/`points` relayed verbatim), mappers onto the existing `StatDrop` primitive. **No grading** |
| `src/lib/daily-v2/adapters/statDropHost.test.tsx` | 30 tests, including renders through the unmodified `StatDrop` |
| `DAILY_V2_LANE_D_HANDOFF.md` | This file |

The full backend inventory, with every file:line at `a018bc0c`, is in the shared notes folder as `lane-D-backend-module-inventory-a018bc0c.md`.

**Zero copies of an existing mode.** The probes assert that `rendererForDailyV2Segment(...)` is **the same object** as the registry's `quizModule` / `metaReflexModule` / `orderForgeModule` / `masterySliceModule`.

## 2. Commands and output

Tooling workaround (per memory): the scratch vitest config at `<scratch>/vitest.d.mts` drops react-swc and uses `esbuild.jsx: "automatic"`, with root = worktree and `@` → `src`. The `--require <scratch>/hook.cjs` hook maps `@rollup/rollup-win32-x64-msvc` to a scratch `@rollup/wasm-node@4.64.3` (the same version as `node_modules/rollup`). Both live outside the repo. `<scratch>` = `C:\Users\mlmit\AppData\Local\Temp\claude\C--Users-mlmit-OneDrive-Desktop-mogsy\3e1372f3-1917-4ebe-ad35-35c74d3c882b\scratchpad`. pnpm was not run.

```
ROOT=<wt> NODE_OPTIONS="--require <scratch>/hook.cjs" npx vitest run --config <scratch>/vitest.d.mts src/lib/daily-v2
  ✓ src/lib/daily-v2/adapters/modeReuse.test.ts      (14 tests)
  ✓ src/lib/daily-v2/adapters/statDropHost.test.tsx  (30 tests)
  Tests 44 passed (44)

npx vitest run ... src/lib/ranked-core/modules/registry.test.ts \
  src/lib/ranked-core/modules/orderForgeModule.test.tsx src/components/interaction-grammar/StatDrop.test.tsx
  Tests 1 failed | 49 passed (50)
```

The one failure is `orderForgeModule.test.tsx > OF4 scene > is tinted art on parchment…` (a CSS text regex). It was run on the **untouched** baseline checkout before any lane D file existed, so it is pre-existing and not caused by this lane.

```
npx tsc --noEmit -p tsconfig.app.json   → 2 errors, both in untouched baseline files:
  src/components/onboarding/OnboardingProfile.tsx(180,48)  TS2345
  src/lib/identity/connections.ts(263,13)                  TS2345
  (0 errors in src/lib/daily-v2/**)

npx eslint src/lib/daily-v2             → clean
```

`npm run build` was **not** run. The new files are imported by nothing outside their own tests, so the bundle is unchanged, and tsc already covers their types. E should build once it wires them in, then run `git checkout -- public/sitemap.xml`.

## 3. Reuse matrix summary

| Mode | Module | FE renderer | Grading | Frozen ref | Timer | Readiness |
|---|---|---|---|---|---|---|
| Standalone MCQ | `quiz` v2 | `quizModule` | exact index | `quiz:<key>` round + child | `timer_seconds` (E/M/H is config) | **Reusable** |
| Meta Reflex 3 | `item_cost_duel` v5 | `metaReflexModule` (count-agnostic) | exact entity per card | `reflex:…` per card | 6 s/card | **Reusable** (`challenge_count:3` legal) |
| Ordering | `order_forge` v2 | `orderForgeModule` → `<OrderForge/>` | one exact sequence, 4–6 entries | `order:…` child row; review round ref **null** | `timer_seconds` | **Content-gated**; range family **missing** |
| Journey | `mastery_slice` v2 | `masterySliceModule` | exact per child (numeric exact at precision) | `mastery:…` per child | **one** clock per segment | **Release decision**: a 3-child Survival plan exists, 30 s per child |
| Stat Drop | none | primitive only | **none** (`graded:false`) | none | — | **Not servable** |

## 4. Missing readiness

R-SD-1..3 (no Stat Drop module, fixture-only content, no FE segment renderer), R-OF-1..3 (no Daily recipe, review ref on child only, **no ability/ward/Farsight/Lux/Ziggs range family**), R-MS-1..2 (Journey 3-child only on the Survival plan with one timer, which conflicts with lane B's 3-segment linked set), R-MR-1 (`meta_reflex_cards: 5` hard-coded, `wiring.py:1130`), R-GEN-1..2 (V1 shape constants, Review slice payout). Details are in matrix section 3.

## 5. Owner decisions needed

- **O-1 Stat Drop tolerance/closeness.** Lane D picks nothing. The options are: (a) absolute ±k steps per family, (b) relative p%, (c) tiered closeness points (a scoring change), (d) exact at displayed precision, (e) keep it ungraded and outside the 21 answers. Every option also needs an answer-independent scale authority (proposed: the family's public range at the frozen patch, enforced by a server test).
- **O-2 Journey 3-child inclusion.** Either one Survival-plan 3-child Journey segment counts as a set, with one per-child answer window (30 s today or a single chosen value, **not** 18/33/48), or Journey is held out of V2 MVP. No generic MCQ substitute.
- **O-3 Order Forge in Daily.** Which of the 14 READY families, the entry count, timer and points. Range ordering needs a new certified family first.

## 6. Integration checklist for E (in order, with proposed diffs)

**Backend (E-owned central files)**
1. **Meta Reflex 3**: compose `item_cost_duel` v5 with `challenge_count=3, card_timer_seconds=6.0, module_config={families}`, reusing `recipe.py:503-519`'s builder with N as a parameter. In `wiring.py:1115-1185`, derive the shape's `meta_reflex_cards` from the frozen format instead of the constant `5`:
   ```diff
   -        "meta_reflex_cards": META_REFLEX_CARDS,
   +        "meta_reflex_cards": _segment_count(format_snapshot, "item_cost_duel"),
   ```
   (`_segment_count` is a hypothetical helper. Read the per-segment `challenge_count` from the frozen `format_snapshot_json`; V1 stays 5 because its snapshot says 5.)
2. **quiz E/M/H**: reuse the Splash spec factories (`content_sets/splash.py:97-116`) with `timer_seconds` 18/33/48 from the V2 slot. No module change.
3. **Journey (only if O-2 = include)**: reuse the Survival Journey spec (`recipe.py:1006-1031,1159-1178`, `mastery_slice` v2, `challenge_count 3`, `card_timer_seconds` = O-2's value). Use one segment, not three. Exclude the day's Standard recipe via `journey_survival_rotation`. Reconcile lane B's `linked_set_id` (3 `slice_child` records) into one segment whose 3 children are the set's positions.
4. **Order Forge (only if O-3)**: reuse the `admin.order_forge` spec shape (`schema.py:2400-2451`) with `pressure_seconds=0` and `correct_points`. Key Review/History on `ranked_segment_child_results` (the round ref is null).
5. Bump `PLAN_VERSION` and add a V2 format id behind the OFF-by-default flag. Freeze V1 unchanged.

**Frontend (E-owned central files)**
6. In the V2-flagged Daily path, resolve renderers with `rendererForDailyV2Segment` instead of `rendererForSegment`, so that only the allow-listed pairs render. The only live call site is `src/pages/quiz-ranked/QuizRankedMatch.tsx:794`; the Daily child match plays through it. `reportSnapshot.ts:65` only reads `reportBoard`.
   ```diff
   -    () => (surfaceRound ? rendererForSegment(surfaceRound.segment) : null),
   +    () => (!surfaceRound ? null : isDailyV2
   +      ? rendererForDailyV2Segment(surfaceRound.segment.moduleId, surfaceRound.segment.moduleVersion)
   +      : rendererForSegment(surfaceRound.segment)),
   ```
   `isDailyV2` comes from the frozen format id or session preset, never from the content.
7. Daily run reader (`src/lib/daily-challenge/run/contracts.ts`): accept the V2 plan version and its set/act metadata from lane B or E's shape. The renderers themselves need nothing.
8. **Stat Drop (only after a backend `stat_drop` module exists and O-1 is decided)**:
   - `contracts.ts`: `SegmentBlockView |= ({contract:"stat_drop"} & StatDropBlockView)`, built through `readStatDropBlock` in `readSegmentBlock`. Add `statDrop?: StatDropChallengeReveal | null` to `MasteryChallengeReveal`, read through `readStatDropReveal` in `readChallengeReveals`. Add `"canonical_value","canonical_display","closeness","band"` to `_FORBIDDEN_SEGMENT_KEYS`. Add `"stat_drop"` to `ReviewRound.kind`.
   - New `src/lib/ranked-core/modules/statDropModule.tsx`, modelled on `orderForgeModule.tsx`'s `OrderForgePhase`: draft keyed on `segment:challenge`, `opensAt` wake, a lock via `actions.submitChallenge(0, {selected})` (the backend `SegmentChallengeIn.selected` already accepts a number), and a reveal from `ownChallengeReveals[0].statDrop` → `toStatDropReveal`. It renders `<StatDrop/>` unchanged and shows the server `outcome`/`points` in the arena verdict, not inside the primitive.
   - `registry.ts`: add `stat_drop: [statDropModule]` with `servesVersion: v => v === 1`. Add `"stat_drop@1"` to `modeReuse.ts` and flip its readiness.
9. Verify locally: targeted vitest via the scratch config, `tsc`, `npm run build` (then `git checkout -- public/sitemap.xml`), and 320–390 px checks in CI or with approved headless runs only (AGENTS.md: no local Edge/Chrome automation).

**Conflicts to watch:** backend draft PRs #68 (touches `wiring.py`, `meta_reflex.py`, `schema.py`) and #46 (`recipe.py`, `wiring.py`). Items 1, 3 and 5 overlap both. Lane A owns `metaReflexModule.tsx` (value reveal); item 6 does not touch it.

## 7. Open questions

1. *(spec)* Are E/M/H timers per answer or per set? This decides whether a fixed-window Journey can be a set.
2. *(spec)* Is Stat Drop among the 21 graded answers, or a bonus?
3. *(spec)* Is there a set-level score? Journey's `slice_points` speed bonus needs every child correct.
4. *(spec)* Do content examples assume a range-ordering family (Farsight/Lux/Ziggs)? None exists.
5. *(spec)* Does a Journey set occupy E/M/H positions, or sit outside them?
6. *(spec)* Must slots map 1:1 to segments, or may one segment cover 3 slots?
7. Order Forge: should Daily Review/History use the child-row `order:` ref (as Mastery does) or should the backend also fill the round ref?
8. Stat Drop content: which canonical authority feeds it (lane C's surprise finder? champion stats?) once it is graded?

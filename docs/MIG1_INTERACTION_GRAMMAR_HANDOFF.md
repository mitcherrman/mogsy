# MIG1 — Mogzy Interaction Grammar: Architecture & Handoff (MIG1.0)

Status: MIG1.0 audit only. No production code changed. Current code is authority; this doc records what it says.

## 1. Objective

A small vocabulary of reusable interaction primitives (Data Duel, Stat Drop, later Order Forge, Match Grid, Who Is This?, Graph Hunt, bracket/roster, Combat Snapshot) that renders inside the **existing** Ranked/Daily arena and serves both Leaguecraft (Ranked, Daily, Study Hall, Mastery, Combat) and Pro Play / authored stories — without a second arena, runtime, scoring engine, question bank, attempt store, or analytics lifecycle.

## 2. Base SHAs inspected (after `git fetch origin`, 2026-09-27)

| Repo | Branch | SHA |
|---|---|---|
| mogsy (frontend) | origin/main | `afa8e57a` test(admin): JREF2 launcher body carries production's browser correlation |
| League_Combat_Simulator (backend) | origin/master | `35450a27` feat(analytics): USERS2.3C-Daily correlation and Ranked wrapper provenance |

Note: both primary checkouts are on a dirty `envvis1-batch1-scene-channel` branch. The audit used clean worktrees at the origin tips (`mogsy/.worktrees/mig1-0-audit`, `League_Combat_Simulator/.worktrees/mig1-0-audit-ro`).

## 3. Existing architecture we reuse

Confirmed layering in current code (repo names in brackets):

```
CONTENT AUTHORITY        backend: Mastery facts/publication, pro_authority, quiz banks
        ↓                (freezes private payload; owns truth)
RANKED MODULE            backend: RoundModule (ranked_modules/contract.py:356)
 (authoritative contract)  generate_segment / validate_challenge_input / challenge_is_correct /
        ↓                  public_view / resolve_segment / challenge_reveals
FORMAT / HOST            backend: RankedFormat + SegmentSpec (ranked_formats/schema.py);
        ↓                Daily recipe composes in-memory formats and hosts child Ranked matches
FRONTEND MODULE          frontend: ModuleRenderer (src/lib/ranked-core/modules/types.ts) + registry
 RENDERER                 Viewport(publicRound, selection, onSelect, actions.submitChallenge, reveal…)
        ↓
INTERACTION PRESENTATION ← MIG lives here (new, frontend-only, pure)
        ↓
ARENA                    frontend: CanonicalArena (src/components/ranked-arena/CanonicalArena.tsx)
                         fed by ArenaViewModel (src/lib/ranked-core/arenaView.ts)
```

**Correction to the proposed ordering:** interaction presentation is not *above* the Ranked module; it sits *below* the frontend ModuleRenderer, which is itself the client half of a backend RoundModule. A primitive is something a module Viewport composes; it is not a host, a module, or an arena slot.

## 4. Ownership / boundary model

| Layer | Owns | Must not |
|---|---|---|
| Content authority (backend) | Facts, question generation, frozen private payload, correct answer, reveal fields | Know about UI primitives |
| RoundModule (backend) | Input shape validation, grading, points (RP1 `points.py`), child outcomes, canonical question refs, reveals | Leak answers pre-reveal (`answer_safety.assert_pre_reveal_safe`, `projections.py`) |
| Format/host (backend + page) | Segment pattern, clocks, Daily stages, Journey cursor, persistence, analytics correlation | — |
| ModuleRenderer (frontend) | Project `publicRound` → primitive props; map primitive response → `SegmentChoice`; call `submitChallenge` | Grade; invent answers |
| **MIG primitive (frontend)** | Layout, input affordance, local selection state, response emission, reveal *display* from supplied data, motion/sound hooks | Know domain facts, grade, score, persist, fetch, call `track()`, import Ranked/Daily/Pro Play clients |
| CanonicalArena | Chrome, rails, timer, beats, result/award presentation | Know about specific primitives |

## 5. What MIG owns vs does not own

MIG owns: `src/lib/interaction-grammar/` (primitive components, their generic prop/response types, a fixture format) and a DEV-only Interaction Lab route.

MIG does **not** own: grading, scoring, question banks, attempt/history tables, analytics events, audio engine, arena, module registry entries, answer transport, Review/History.

## 6. Reusable components / files and why

Frontend (`mogsy`):
- `src/components/ranked-arena/CanonicalArena.tsx` — the one arena. Props: `view`, `terminal`, slots `chrome/guidance/outro/warning`, `recovering`. Already hosted by Ranked (`pages/quiz-ranked/QuizRankedMatch.tsx`), Daily (`pages/quiz-daily-challenge/run/DailyRunPage.tsx`), Playtest (`components/playtest/PlaytestMatchHost.tsx`), Journey dev harness (`pages/dev/journey-arena/`).
- `src/lib/ranked-core/arenaView.ts` — `ArenaViewModel` is transport-free by design ("ARENA1 Step 3"); a lab can build one from fixtures. `ArenaSurfaceView.renderer` takes a `ModuleRenderer`. `ArenaRail` has an unused `{kind:"panel"}` slot (line 120) for non-PvP flanks.
- `src/lib/ranked-core/modules/{types.ts,registry.ts}` — ModuleRenderer contract; registry: `quiz.v1`, `item_cost_duel.v1`, Meta Reflex (`item_cost_duel.v4+`, `metaReflexModule.tsx`), `mastery_slice.v1`.
- `src/lib/ranked-core/modules/MasterySliceChallengeSurface.tsx` — **already dispatches `comparison_left_right` and `atomic_recall` interaction kinds over `single_choice | numeric | boolean` answer types.** This is the existing interaction dispatch; MIG primitives should become what it renders, not a sibling to it.
- `src/features/mastery/` (`MasteryChoiceInput`, `MasteryNumericInput`, `MasteryRevealView`) — reference numeric/choice inputs.
- `src/pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx` — existing fixture-only, presentation-only CanonicalArena harness (component-level DEV guard, line 1759). Closest precedent for the Lab.
- `src/lib/journey/{beat.ts,rail.ts}`, `src/lib/ranked-core/flow/useSpecialTransition.ts` — persistent boards / timed transition beats.
- Reveal vocabulary: `SurfaceReveal` (`src/lib/question-surface/contract.ts`), `ResolvedFeedback` (`src/lib/question-feedback/model`), `PointsFeedbackView` (`ranked-core/pointsFeedback.ts`), `AwardEvent` (`components/ranked-arena/AwardPops`), `header.centralResult`.
- Audio: `src/lib/audio/{engine.ts,sfx.ts,sfx-registry.ts,useSfx.ts}`, `components/audio/useRankedAudioBoundary.ts`, `pages/quiz-ranked/useRankedMatchSfx.ts` (SFX1/SFX2: one cue per settlement, module < Daily stage).
- Dev-route production-strip pattern: `src/lib/combat-lab/team-sim/featureGate.ts` + conditional `<Route>` in `src/App.tsx:606` + `src/App.teamSimRoutes.test.ts`.

Backend (`League_Combat_Simulator`):
- `ranked_modules/contract.py` (RoundModule, `ChildOutcome` with `answer: Any`, `canonical_question_ref`), `ranked_modules/registry.py`, `ranked_modules/mastery_slice.py` (v1/v2; `validate_challenge_input` :1827, `challenge_is_correct` :1861, `challenge_reveals` ~:1950), `ranked_modules/points.py`.
- `ranked_formats/schema.py` (`SegmentSpec` :150, `RankedFormat` :789); `daily_challenge/recipe.py` (Standard/Time Trial composition); `ranked_public/host.py:66` (`daily_stage_host`).
- `answer_safety.py`, `ranked_public/projections.py` — pre-reveal guarantees.
- `ranked_public/review.py`, `daily_challenge/run/review.py`, tables `ranked_segment_challenges` (`choice_json`), `ranked_segment_child_results`, `ranked_question_discoveries`, `daily_run_*`.

## 7. Current answer / input contracts

- Frontend (`src/lib/ranked-public/client.ts:510`):
  `SegmentChoice = { itemId } | { cardId } | { selected: string | number | boolean }`; `actions.submitChallenge(challengeIndex, choice)`; challenge index in URL.
- Backend (`schemas/ranked_public_schemas.py:172` `SegmentChallengeIn`, `extra="forbid"`): exactly one of `item_id`, `card_id`, `selected: StrictBool|StrictInt|StrictFloat|StrictStr` (strings 1–128 chars).
- Mastery answer types: `single_choice` (str ∈ `answer_options`), `boolean`, `numeric` (non-bool int/float). Numeric grading is binary: `EXACT_INTEGER` or `ROUNDED_DECIMAL` (same displayed rounding cell) — `mastery/questions/precision.py`. Input constraints (unit/step/decimals) published via `_numeric_input_constraints` (`mastery_slice.py:361`).
- Pro Play quiz (`routes/pro_play.py`, `pro_play/quiz_session.py`): separate in-memory session, `selected_answer: str`, **not** a RoundModule.

Mapping: Data Duel → `selected: "<option token>"` (single_choice / comparison_left_right). Stat Drop → `selected: <number>` (numeric). Both fit today's transport unchanged.

## 8. Confirmed limitations

1. **No structured answers.** Arrays/pairs/objects are rejected with 422 at `SegmentChallengeIn`. Order Forge / Match Grid cannot ship through Ranked without extension. Storage (`choice_json`) and `ChildOutcome.answer` already accept any JSON.
   Future extension point (do **not** do in MIG1): add one bounded `structured` field to `SegmentChallengeIn` + `as_choice`; add a matching `SegmentChoice` variant; add explicit answer-type branches in `mastery_slice.validate_challenge_input` (unknown types currently pass through silently — a latent hazard), `challenge_is_correct`, `bot_challenge_input`, reveal `player_answer`; check `ranked_public/service.py` validate/grade sites and `segment_flow.py:386/701`.
2. **No closeness scoring.** Stat Drop "how close were you" is display-only unless a future module grades bands. Grading stays binary.
3. **Pro Play has no Ranked module.** A Pro Play Data Duel in production would need Pro Play content to publish through an existing module (most likely as Mastery-style frozen children) — not a new runtime. Deferred until a lab-proven interaction needs it.
4. **Analytics has no DEV suppression** (`src/lib/analytics/track.ts`). The Lab must not mount controller hooks that call `track`/`useSurfaceEvent`.
5. **Dev routes are mostly registered unconditionally** in `App.tsx`; the Lab must use the team-sim gate pattern so it is stripped from production builds.

## 9. Overlap / conflict analysis

| Workstream | State at base | MIG1.1 impact |
|---|---|---|
| NAV1 back navigation | `origin/nav1/back-navigation-audit` docs-only; targets `quiz-ranked/*`, `quiz-daily-challenge/run/*`, `Layout`, `GlobalHud`, Settings/Profile | Do not touch those files. |
| Codex NAV1-E worktrees (leave contract, Ranked leave, Daily exit) | Active local worktrees | Same: avoid Ranked/Daily page files. |
| DCMOD / Daily | `dcmod/integrate-daily` merged; `dcmod/a–d` branches are 264 behind master, likely superseded (not verified per commit) | None; Lab does not touch Daily. |
| Journey (J2–J5, JREF2, motion, K2) | Landed | Reuse beats/rail read-only. |
| Ranked / CanonicalArena / RMOB / RS | Landed | Read-only consumption of `CanonicalArena`/`arenaView`. |
| Playtest | Landed | None. |
| USERS2 analytics/correlation | Landed through 3C (both repos) | Lab emits nothing. |
| Question-surface convergence (F1) | Design note, "no action without G-series sign-off"; proposes `answerType`-keyed adapters | **Direct conceptual overlap.** MIG primitives are the natural adapters; keep types compatible, don't edit `question-surface/*` in MIG1.1. |
| Mastery interaction/rendering | `MasterySliceChallengeSurface` dispatch landed | Don't modify in MIG1.1; adopt in MIG1.3. |
| Meta Reflex | Landed | None. |
| Pro Play quiz/data | Separate quiz; `src/lib/pro-play/statsApi.ts` + profile pages have uncommitted edits in the primary checkout | Lab uses static fixtures only; do not import `statsApi`. |
| ENVVIS1, ATLAS2, HUB* | Local worktrees | No overlap found. |

## 10. MIG1 phased plan

- **MIG1.0** — this audit.
- **MIG1.1** — frontend-only DEV Interaction Lab: Data Duel + Stat Drop, each with a Pro Play and a Leaguecraft fixture, rendered inside the real `CanonicalArena`.
- **MIG1.2** — reveal/motion/sound polish in the Lab (existing SFX registry cues, beats); mobile pass (RMOB constraints).
- **MIG1.3** — adopt primitives inside `MasterySliceChallengeSurface` for `comparison_left_right` / `numeric` (pure refactor, no contract change, snapshot parity). Coordinate with F1.
- **MIG1.4** — first production content path decision (e.g. Pro Play facts as frozen Mastery-style children). Backend work only then.
- **Later** — structured answers (§8.1) only once Order Forge/Match Grid is proven in the Lab.

## 11. MIG1.1 exact scope

1. `src/lib/interaction-grammar/` with two pure primitives:
   - `DataDuel` — props: `prompt`, two `{ token, label, sublabel?, media? }` sides, optional `metricLabel`; emits `{ selected: token }`; reveal props `{ correctToken, values? }` supplied by caller.
   - `StatDrop` — props: `prompt`, `unit`, `min/max/step/decimals` (same shape as Mastery numeric constraints); emits `{ selected: number }`; reveal props `{ correctValue, displayValue }`.
   - Responses typed as a subset of `SegmentChoice` so a future ModuleRenderer maps them 1:1.
2. Fixtures (static TS): Pro Play (e.g. two players' career KDA; Faker games played) and Leaguecraft (e.g. two champions' base AD; an ability cooldown). Fixtures hold the answer only on the **reveal** side object, never inside primitive input props.
3. A lab-local `ModuleRenderer` + fixture-built `ArenaViewModel` driving `CanonicalArena`; local fake "grading" in the lab controller only (clearly lab-scoped).
4. DEV route `/dev/interaction-lab`, production-stripped via gate + conditional route + route test.
5. Toggle: primitive × domain × phase (open/submitted/revealed) × viewport.

Out of scope: backend, transport, registry entries, audio engine changes, analytics, Ranked/Daily/Mastery production files.

## 12. Likely files MIG1.1 touches

- `src/lib/interaction-grammar/{types.ts,DataDuel.tsx,StatDrop.tsx,index.ts}` + tests
- `src/lib/interaction-grammar/__fixtures__/{proPlay.ts,leaguecraft.ts}`
- `src/pages/dev/interaction-lab/{InteractionLab.tsx,labRenderer.tsx,labArenaView.ts}` + test
- `src/lib/interaction-grammar/featureGate.ts` (DEV gate)
- `src/App.tsx` (one lazy import + one gated `<Route>`), `src/App.interactionLabRoutes.test.ts`

## 13. Must NOT touch in MIG1.1

`src/pages/quiz-ranked/*`, `src/pages/quiz-daily-challenge/*`, `src/components/ranked-arena/*` (consume only), `src/lib/ranked-core/arenaView.ts`, `src/lib/ranked-core/modules/*` (incl. registry, MasterySliceChallengeSurface), `src/lib/ranked-public/*`, `src/lib/question-surface/*`, `src/lib/analytics/*`, `src/lib/audio/*` (use existing cues only), `src/lib/pro-play/*`, `src/features/mastery/*`, `Layout`/`GlobalHud`/nav files, entire backend repo.

## 14. Test / QA expectations

- Vitest: primitives emit the correct `SegmentChoice` shape; primitive props types contain no answer fields pre-reveal; same component renders both fixtures with zero domain branching (grep test: no "Faker"/champion names in `interaction-grammar/*.tsx`).
- Route test: Lab route absent when gate is false (mirror `App.teamSimRoutes.test.ts`).
- Lab test: renders inside `CanonicalArena`; no `track` calls (spy).
- `npm run lint`, `npm test`, `npm run build` green.
- Manual: 375×812 and desktop screenshots for each primitive × domain × phase.

## 15. Open questions (genuinely unresolved)

1. Production home for Pro Play interactions: publish through `mastery_slice` children (preferred by reuse) or retire the standalone Pro Play quiz into Ranked? Decide at MIG1.4.
2. Should Stat Drop ever score closeness? Would require a new module grading policy; product decision.
3. F1 sign-off: will the G-series accept MIG primitives as the `interactionAdapters` implementation?

## 16. Recommended branch / worktree for MIG1.1

Branch `mig1/1-interaction-lab` from `origin/main`, worktree `mogsy/.worktrees/mig1-1-interaction-lab`. Frontend only.

---

# MIG1.1 — Interaction Lab (Data Duel + Stat Drop)

Status: implemented on `mig1/1-interaction-lab`, **not pushed**. Frontend only, DEV only.

## A. SHAs

| What | SHA |
|---|---|
| Frontend base (`origin/main` at fetch) | `3011a416` feat(analytics): USERS2.3C-Daily browser correlation for Daily Challenge |
| MIG1.0 handoff (docs-only, cherry-picked from `mig1/0-audit` `91aa5ebe`) | `7c05cc1d` |
| MIG1.1 implementation | `d8d7fb35` feat(mig1): add interaction lab with data duel and stat drop |
| Backend inspected (read-only, untouched) | `35450a27` at fetch. `origin/master` has since moved to `fe942a58` via another session's push (JREF2 merge), which is not relevant to MIG1.1. |

Worktree: `mogsy/.worktrees/mig1-1-interaction-lab`. Its node_modules is a junction to the primary checkout's, the same pattern other worktrees use.

## B. Files

Added:
- `src/lib/interaction-grammar/types.ts`: neutral contracts. `*Public` (pre-reveal) and `*Reveal` (post-reveal) are separate types. Responses are compile-time-checked subsets of `SegmentChoice`.
- `src/lib/interaction-grammar/featureGate.ts`: `isInteractionLabEnabled()` (= `import.meta.env?.DEV === true`) and `INTERACTION_LAB_ROUTE`.
- `src/components/interaction-grammar/DataDuel.tsx`, `StatDrop.tsx`, `shared.tsx`: the two primitives, plus art, chip, evidence and suspense bits.
- `src/pages/dev/interaction-lab/InteractionLab.tsx`: lab page and controller (phase machine, lab rails, controls).
- `src/pages/dev/interaction-lab/labRenderers.tsx`: two lab-only `ModuleRenderer`s (`mig_lab.data_duel`, `mig_lab.stat_drop`) and the lab stage context.
- `src/pages/dev/interaction-lab/labArenaView.ts`: projects lab state into a real `ArenaViewModel`.
- `src/pages/dev/interaction-lab/labFixtures.ts`: four fixtures adapted from existing authority captures.
- Tests: `DataDuel.test.tsx`, `StatDrop.test.tsx`, `InteractionLab.test.tsx`, `src/App.interactionLabRoutes.test.ts`.

Changed:
- `src/App.tsx`: one gated `lazy` import and one gated `<Route>`. Nothing else.

## C. Architecture

```
authority capture (proPlaySamples.ts / Journey J3,J4 captures)
        ↓  labFixtures.ts: { content: *Public, hidden: *Reveal }
lab controller (InteractionLab): phase open → locked → (suspense) → revealed
        ↓  labArenaView → ArenaViewModel { surface.renderer = lab renderer, rails = {kind:"panel"} }
CanonicalArena (production, unmodified)
        ↓  Viewport props: selection / onSelect / permissions / actions.submitChallenge / reveal
lab ModuleRenderer (never registered)
        ↓
DataDuel / StatDrop (content-neutral; emit { selected: string } / { selected: number })
```

- **One renderer per mechanic, not per domain.** `labRendererFor(mechanic)` takes no domain. Switching domain swaps the fixture only.
- **Reveal path.**
  - Data Duel's reveal rides the arena's own `SurfaceReveal`: `correctOptionId` plus RG3's `evidence: {kind:"comparison", left, right, winner}`, the slot RG3 designed for comparisons.
  - `SurfaceReveal` has **no numeric-answer slot**, so Stat Drop's reveal comes through the lab stage context, and only while `surface.reveal.revealed` is true. This gap is the first thing MIG1.3 must close.
- **Verdict.**
  - For Data Duel only, the lab controller compares the emitted token with the fixture's canonical token. The result feeds the arena's existing `QuestionResultOverlay` (`resultFeedback.viewer = {kind:"round"}`).
  - This is the only grading in the lab, and it is lab-scoped.
  - Stat Drop has no verdict and no points. It shows the absolute difference, and only after reveal.
- **Styling reuse.**
  - Duel sides carry a bare `data-quiz-choice` and `data-choice-state` inside a `data-answers-state` group. `.ranked-academy` therefore paints them as Ranked carved tablets (idle, selected, locked, correct, incorrect-selected).
  - No new CSS was written. `!py-0` opts out of the grid's padding rules.
  - Only stylesheets read the attribute. No SFX, analytics or report code does.
- **Motion.**
  - tailwindcss-animate utilities are gated on `useReducedMotionPreference()`, which covers both the OS setting and Mogzy's own Reduce Motion.
  - Suspense beat: 1100 ms, or 450 ms under reduced motion.
  - Under reduced motion, zero `animate-*` classes are rendered (verified in the browser).
- **No leaks.**
  - `*Public` types cannot carry an answer.
  - Before reveal, the DOM contains no value, no evidence, no `data-canonical` and no `correct` state. This is tested for all 4 fixtures.
  - Stat Drop scales are lab presentation chosen per metric family (`LAB_SCALES`), never derived from the value. The untouched estimate is mid-scale.

## D. Fixtures (exact)

| Mechanic · Domain | Prompt | Canonical | Source |
|---|---|---|---|
| Data Duel · Pro Play | In LCK, which team has more games played on Gragas: T1 or KT Rolster? | KT Rolster (84 vs T1 64) | `PRO_PLAY_SAMPLES.t1_lineage` (generated against the live authority). A pairwise projection of its 4-team ranking, with the same metric, scope and values. |
| Data Duel · Leaguecraft | At rank 1, which has the shorter cooldown: Leona R (Solar Flare) or Pantheon R (Grand Starfall)? | Leona (90s vs 180s) | J3 capture `pantheon.standard`, child 3 (`comparison_left_right`). Prompt via production `formatComparisonPrompt`. |
| Stat Drop · Pro Play | How many pro games has Peanut played on Sejuani? (scale 0–200, step 1) | 113 | `PRO_PLAY_SAMPLES.pro_play` (production capture, 2026-09-04) |
| Stat Drop · Leaguecraft | With 10 Ability Haste, what is Olaf Q (Undertow)'s cooldown, in seconds? (scale 0–20, step 0.1) | 8.2 (8.1818…) | J4 capture `olaf.standard`, child 2 (`numeric`; `input_constraints` step and decimals reused). Prompt via production `formatRecallPrompt`. |

There is no trustworthy Faker fixture in the repo: the Faker row in `ProStatsExplorer.test.tsx` is a hand-written mock. T1 and Peanut were used instead of inventing numbers.

The Leona/Pantheon per-side values are parsed fail-closed out of the authority's explanation sentence, because the backend publishes no structured per-side values for a comparison child.

## E. QA (dev server, in-app browser)

| Viewport | Result |
|---|---|
| 375×812 | Both mechanics fit in one column. Flank rails are hidden below `lg` by design. Touch drag, nudge and lock work. No horizontal overflow. |
| 768×1024 | Stacked arena, no overflow. The whole interaction is above the fold. |
| 1024×768 | Three-column arena with lab rails. The stage bottom (756) is inside the viewport (768). Lab controls wrap clear of the global HUD. |
| 1440×900 | Revealed Data Duel plus evidence fits (stage bottom 888 of 900). No overflow. |

Also verified in the browser:
- pointer drag
- keyboard: Stat Drop arrows, PageUp and Enter to lock; Data Duel arrows plus Enter
- Reset and Replay reveal
- the app's `reduce-motion` class removes all animation and shortens the beat

The only external requests while the lab was open were fonts and the app shell's own Supabase reads (`app_settings`, audio config). These come from Layout, not the lab. There were no analytics writes and no beacons.

Observations for MIG1.2:
- The arena's INCORRECT/CORRECT overlay tint washes out the tablets' cyan/red reveal states. At 375 px its stamp sits over the metric chips.
- The document scrolls below the arena because of the site footer (Layout). This is pre-existing and the same on other `/dev` arena harnesses.
- The phrasing "Olaf Q (Undertow)'s" comes from production `formatRecallPrompt`, reused unchanged.

## F. Tests

New, all passing:
- `DataDuel.test.tsx` (13)
- `StatDrop.test.tsx` (15)
- `InteractionLab.test.tsx` (10)
- `App.interactionLabRoutes.test.ts` (5)

They cover:
- **Leaks:** no canonical value or evidence in the pre-reveal DOM, for both domains.
- **Data Duel:** left and right selection, locked state, keyboard, accessible radiogroup; after reveal, both values plus the canonical tag and the pick tag.
- **Stat Drop:** pointer change, keys, nudges, explicit lock emitting a number; reveal with true value, gap and delta.
- **Domain switching:** the same component serves both domains.
- **Lab integration:**
  - `CanonicalArena` actually hosts the primitive.
  - Renderer and primitive are unchanged after a domain switch.
  - Reset works, and switching content mid-reveal resets too.
- **Side effects:** zero `track`/`trackAsync` calls and zero `fetch` across a full session.
- **Production isolation:**
  - The registry is unchanged: `registeredModuleIds()` is still `item_cost_duel, mastery_slice, quiz`, and `rendererForSegment` returns null for `mig_lab.*`.
  - An import guard rejects analytics, audio, Ranked/Daily pages, the Ranked client, statsApi and supabase.
  - No production file except `App.tsx` references the lab.
  - The route and the lazy import are gated on DEV.

Other checks:
- **Affected existing suites** (`src/components/ranked-arena`, `ranked-arena-inspector`, `QuizRankedMatch.geometry`, `ranked-core/modules`, `App.teamSimRoutes`): all pass except 5 tests in `AnswerGrid.elimination` and `QuestionStageGeometry`. Those 5 fail **identically on clean `origin/main` 3011a416**: source-scanning assertions break on Windows `\` path separators and CRLF.
- **`tsc -p tsconfig.app.json`:** clean apart from 2 pre-existing errors in `OnboardingProfile.tsx` and `identity/connections.ts`, which this branch does not touch.
- **`eslint` on the new files:** 0 errors, 6 `react-refresh/only-export-components` warnings (the same pattern as other dev pages).
- **Full suite:** a whole-suite `vitest run` OOMs on this Windows machine, and it does so identically on clean `origin/main` (`ERR_IPC_CHANNEL_CLOSED`, heap limit). It was therefore run as 4 shards (`--shard=i/4`):
  - Shards 1, 2 and 4 ran 9,312 tests: 9,245 passed, 63 failed across 18 files.
  - Those 18 files were re-run on a clean `origin/main` 3011a416 worktree. They failed **identically: the same 63 tests, file for file**. None are MIG1.1 files; they are security/guard/source-scanning, admin, profile and welcome suites, largely Windows path/CRLF assertions.
  - Shard 3 OOMs in vitest's main process ~30 s in, even at `--maxWorkers=1`. The baseline's full run died the same way, so this predates MIG1.1.
  - Every MIG1.1 test file and every arena/module suite it touches was run separately and passes, except the 5 pre-existing failures above.

**Production-route exclusion proof.**
- A production `vite build` of this branch contains zero occurrences of any of: `interaction-lab`, `InteractionLab`, `mig_lab`, `mig-data-duel`, `mig-stat-drop`, `Interaction Lab`, `Lock estimate`, `duel-side-left`.
- It emits no lab chunk.
- Control: the ungated dev routes `ranked-arena-inspector` and `journey-arena` do appear in the same bundle.
- The gate covers both the `lazy()` import and the `<Route>`. So the path 404s, and the chunk (fixtures included) is dead-code-eliminated.

## G. Deliberately NOT changed

- `CanonicalArena`, `arenaView.ts`, `ranked-core/modules/*` (registry included), `MasterySliceChallengeSurface`, `question-surface/*`.
- Ranked and Daily pages, `ranked-public/*`, analytics and audio.
- `pro-play/*` and `features/mastery/*`: their fixtures and formatters are imported read-only.
- Layout, HUD and the sitemap.
- The entire backend.

This branch adds no CSS, audio assets, analytics events, backend endpoints, `SegmentChoice` widening, scoring formula or persistence.

## H. Known limitations

1. `SurfaceReveal` has no numeric slot, so Stat Drop's reveal uses lab context (§C). Production needs a typed numeric reveal built from Mastery's `correct_answer` / `correct_answer_display`.
2. Comparison children publish no structured per-side values, so the lab parses the explanation text. A production Data Duel needs `values` on the reveal.
3. Mastery comparisons have a 3-way domain (`a` / `b` / `tie`), but Data Duel is 2-sided, so a canonical tie cannot be expressed yet. An optional "equal" affordance is needed before MIG1.3 adopts Data Duel for `comparison_left_right`.
4. Stat Drop scale bounds are lab-authored. Production needs a published, answer-independent scale rule per metric family, or the scale itself becomes a hint.
5. No sound, by design (see MIG1.2).
6. Pro Play team sides have no logo art, only monograms. `pro-play/mediaApi` is a network client and was deliberately not used.

## I. Sound opportunities (MIG1.2, existing cues only)

- Side select tick.
- Lock thunk.
- Suspense riser (≤1 s).
- Value-arrival stinger on reveal: one cue per settlement, per SFX1/SFX2.
- Stat Drop marker-drop impact on arrival only, with no closeness semantics.

All of these must use existing `sfx-registry` cues through a lab-safe path: not `useRankedMatchSfx`, and nothing that emits analytics.

## J. Recommended MIG1.2 task (do not start without sign-off)

**MIG1.2: Data Duel + Stat Drop polish and certification (lab only, frontend only).**

1. **Sound.** Wire existing SFX registry cues (select, lock, suspense, reveal) through a side-effect-free presentation hook the lab can use. No new assets, no analytics.
2. **Motion tuning.**
   - Suspense length and the value-arrival stagger.
   - A Stat Drop marker "drop" with a settle.
   - Contrast between the overlay tint and the tablets' reveal states.
   - Keep reduced-motion parity.
3. **Richer reveals.**
   - Data Duel margin visual: a "wins by N" bar drawn only from revealed values.
   - Stat Drop "where the truth sits" scale callout.
   - Fix the overlay stamp covering the metric chips at 375 px.
4. **Responsive certification** at 375, 768, 1024×768, 1280×720, 1440×900 and 1920, with screenshots stored in the handoff. Include a design spike for the Data Duel tie affordance (limitation 3).
5. **Decision memo per mechanic:** promote to Daily (via MIG1.3 adoption in `MasterySliceChallengeSurface` for `comparison_left_right` / `numeric`) or hold. List the backend reveal fields each mechanic would need (limitations 1, 2 and 4).

---

# MIG1.2 — Interaction polish + product certification

Status: done on `mig1/1-interaction-lab`, **not pushed**. Still LAB-ONLY and DEV-only. Nothing was productionized.

## A. SHAs

| What | SHA |
|---|---|
| Start (MIG1.1 end) | `c3dfcdae` |
| `origin/main` at fetch (unchanged, so no rebase) | `3011a416` |
| MIG1.2 implementation | `9e251141` feat(mig1): polish data duel and stat drop interactions |
| MIG1.2 docs + evidence | the commit that adds this section |

## B. Polish changes

### Data Duel (`src/components/interaction-grammar/DataDuel.tsx`)

- **Margin reveal.** A centre-origin bar, drawn only from the revealed numbers, grows from the middle toward the side the reveal names. Its length is the gap relative to the larger value: 90s vs 180s reads as a rout, and 583 vs 590 HP as a whisker (with a 5% floor so it stays visible). It is also written out in words: "Leona by 90s", "Weiwei by 17.9 pts", "Dead even — 9s each".
  - The primitive never decides a winner from the numbers. It draws toward `reveal.canonicalToken`, because "better" depends on the metric (a shorter cooldown, a higher win rate), which it does not know.
- **Tie.** New optional `content.tie`: a slim, neutral third tablet ("= Same value") in the same radiogroup.
  - Keyboard order: left → right → tie.
  - On a tie reveal, both values show, the tie tablet takes the answer state, and the margin draws a centred even-mark.
  - Why it is needed: the production Mastery comparison domain is ALWAYS `[a, b, "tie"]` (`mastery.manifest_session.adapter._answer_and_options`), so a tie is genuinely required on the promotion path.
  - Pro Play pairwise payloads carry no tie, so their fixtures omit it.
- **Keys** are relative to the focused option (the WAI radio pattern), and Enter locks.
- **Motion.**
  - A one-shot selection press.
  - A lock "compression" (zoom-in-95, 200ms).
  - Staggered value arrival, then the answer tag, the margin bar (700ms grow) and the evidence.
  - No loops except the ≤0.9s suspense dots.
- **Typography.** Authority values render as a large number plus a smaller unit ("590 HP", "25.0%"), still verbatim text.
- **Identity.** Champion sides use canonical champion art. Where no art exists, a single-letter monogram (or the authored short code, "T1"/"KT") replaces the three-letter slice.
  - Pro Play team and player portraits exist only behind `pro-play/mediaApi` (a network client), so they were deliberately not used; no new asset system was built.

### Stat Drop (`src/components/interaction-grammar/StatDrop.tsx`)

- **ACTUAL callout.**
  - An "ACTUAL {value}" flag drops onto the scale ABOVE the rail, with a stem into it. It clamps at the scale ends, and out-of-scale values get ◀/▶.
  - The readout becomes You | **Actual** (large, glowing, with unit) | Off · under/over.
  - The player's thumb stays on the rail, marked "You".
- **Gap.** A band grows from the estimate to the truth (700ms). Under reduced motion it is drawn at full size immediately.
- **Outcome.** `dropOutcome()` returns `under` | `over` | `exact`, where "exact" means equal **at the answer's displayed precision** (8.2 vs 8.1818… → exact). That is the same cell the backend's `ROUNDED_DECIMAL` grading uses.
  - It is written in words ("Dead on", "Off · under"), so it never depends on colour.
  - It is a description, not a grade: no points and no bands.
- The locked readout and thumb compress once on lock.

### Lab (`src/pages/dev/interaction-lab/`)

- 12 certification fixtures (§C), a fixture selector (chips from `xl`, a native select below), ◀/▶ cycling across both domains, and `?fixture=` deep links.
  - Changing fixture, mechanic or domain always starts a fresh round.
- Compact phone controls: two rows, with icon buttons for Reset / Replay / Cues.
- **Verdict-stamp gutter.**
  - A constant top reserve in the lab's Data Duel viewport (`pt-10 sm:pt-8 lg:pt-11`, stepping with the stamp's 2.4vw type) keeps the arena's CORRECT/INCORRECT stamp off the metric chips at every size.
  - The arena is unchanged, and the gutter never jumps at reveal.
- **Suspense** is 900ms (was 1100), and 200ms under reduced motion, so the player is never made to wait through an animation that isn't playing.
- **Sound:** `labCues.ts` (see §E).

## C. Fixture matrix (12, all adapted from repo captures; no invented facts)

| Id | Domain | Certifies | Canonical | Source |
|---|---|---|---|---|
| `duel.pp.t1-kt-gragas` | Pro Play | team vs team · count · monogram | KT Rolster 84 vs 64 | `PRO_PLAY_SAMPLES.t1_lineage` (pairwise projection of a 4-team ranking) |
| `duel.pp.weiwei-h4cker-udyr` | Pro Play | player vs player · rate · large margin | Weiwei 25.0% vs 7.1% | `champion_player` (production capture; authority's own answer and question text) |
| `duel.pp.viktor-jarvan-picks` | Pro Play | champion vs champion · 113-char scope · art · close | Viktor 6 vs 4 | `recent` (production capture; authority's own answer and question text) |
| `duel.lc.leona-pantheon-r` | Leaguecraft | ultimate cooldown · large margin · art | Leona 90s vs 180s | J3 `pantheon.standard` child 3 |
| `duel.lc.ahri-syndra-health` | Leaguecraft | champion base stat · close margin · no art | Ahri 590 vs 583 HP | `masterySlicePreviews.json` (verbatim `mastery_preview.py`, matchup generator) |
| `duel.lc.olaf-lucian-tie` | Leaguecraft | cooldown · exact tie · mixed rank context | tie, 9s = 9s | Lab pairing of J4 `olaf.standard` child 1 and J4 `lucian.standard` child 1, same patch. Prompt from production `formatComparisonPrompt` over the two captured side contexts. |
| `drop.pp.peanut-sejuani` | Pro Play | integer · broad 0–200 | 113 | `pro_play` (production capture) |
| `drop.pp.nuguri-kennen-wr` | Pro Play | decimal percent · 0–100 step 0.1 | 75.0 % | `nuguri_clear` |
| `drop.pp.splyce-gangplank` | Pro Play | integer · small 0–40 | 16 | `champion_team` (production capture) |
| `drop.lc.olaf-undertow-haste` | Leaguecraft | decimal · narrow 0–20 step 0.1 (authority `input_constraints`) | 8.2 (8.1818…) | J4 `olaf.standard` child 2 (real `numeric` child) |
| `drop.lc.ahri-armor-l3` | Leaguecraft | champion stat · integer 0–100 | 27 (27.195) | J3 `zed.standard` child 0 |
| `drop.lc.zed-shadow-slash` | Leaguecraft | combat calculation · broad 0–300 | 55 | J3 `zed.standard` child 2. Prompt from production `combatQuestionSentence` plus captured scenario inputs. |

Lab-only adaptations, flagged in `labFixtures.ts`:
- Two pairings/projections (`t1-kt`, `olaf-lucian-tie`).
- Leaguecraft comparison values parsed fail-closed from explanation prose.
- Pro Play numbers read from the evidence rows' structured `display` field.
- `ahri-armor` and `zed-shadow-slash` were served as `single_choice`: the value is the authority's, but the numeric presentation is the lab's.
- Stat Drop scales come from per-family `LAB_SCALES`, never from the answer; a test pins this.

There is no trustworthy Faker fixture in the repo (the Faker row in `ProStatsExplorer.test` is a hand-written mock), so there is no Faker fixture.

## D. Screenshots — `docs/audits/mig1-interaction-lab/`

| File | Shows |
|---|---|
| `duel-1440-open-proplay-t1-kt.jpg` | Data Duel, desktop, open (Pro Play, monogram identity) |
| `duel-1440-reveal-leaguecraft-leona-pantheon.jpg` | Desktop reveal, incorrect pick, large margin |
| `duel-1440-reveal-tie-olaf-lucian.jpg` | Tie reveal: even-mark and "Same value" answer |
| `duel-1024x768-reveal-no-art-ahri-syndra.jpg` | Short desktop, no-art sides, close margin (7 HP) |
| `duel-375-open-long-label-viktor-jarvan.jpg` | Phone open, long Pro Play scope, champion art |
| `duel-375-reveal-proplay-weiwei-h4cker.jpg` | Phone reveal, stamp clear of the chips |
| `drop-1440-open-combat-zed.jpg` | Stat Drop, desktop, open (combat calculation) |
| `drop-1440-reveal-over-proplay-nuguri.jpg` | Desktop reveal, estimate over, decimal percent |
| `drop-1280x720-reveal-under-proplay-peanut.jpg` | Short desktop reveal, estimate under, broad range |
| `drop-375-open-decimal-olaf.jpg` | Phone open, decimal narrow scale |
| `drop-375-reveal-exact-ahri-armor.jpg` | Phone reveal, exact ("Dead on") |

`qa-metrics.json` in the same folder holds the raw measurements:
- Captured with headless Edge through Playwright, touch emulation below 768.
- Every non-local request was aborted except fonts and champion art; the only attempted ones were the app shell's six Supabase GETs, listed in the file.

## E. Audio

- **Boundary audit.**
  - `CanonicalArena` and its components play no sound.
  - Ranked's settlement cues live in `useRankedMatchSfx` / `useRankedMatch`, which the lab does not mount.
  - The SFX engine (`lib/audio/sfx.ts`) has no analytics and no network for built-in synth voices. It fetches only operator-bound asset voices, and none of the cues below are assets.
- **Lab cues** (`labCues.ts`) use the existing registry only:

  | Moment | Cue |
  |---|---|
  | Duel pick | `leaguecraft.record.selection` |
  | Lock | `ranked.answer.lock` |
  | Duel reveal | `ranked.answer.correct` / `ranked.answer.incorrect` (one per settlement) |
  | Stat Drop reveal | `combat.simulation.resolve` (neutral; no verdict exists) |

  Stat Drop dragging is deliberately silent (it would chatter).
- Every play carries a per-round `eventId`, so the engine dedupes re-renders. One user action produces one cue (tested).
- **Preferences.**
  - The global mute (`mogsy-sounds-muted`, set by Settings/HUD) is honoured by the engine's master gain and shown in the lab rail.
  - Audio Studio policy still gates built-ins.
  - A per-viewer lab switch ("Cues on/off", localStorage `mogzy.mig-lab.cues`) silences the lab without touching the global preference.
- No audio files were added.

## F. QA

Responsive sweep, from `qa-metrics.json`:
- **Viewports:** 375×812, 390×844, 768×1024, 1024×768, 1280×720, 1440×900.
- **Cases:** tie duel, long-label duel, combat drop, percent drop; each open and revealed.
- **Results:**
  - Horizontal scroll: 0 in all 48 states.
  - Clipped controls: none.
  - Primitive targets under 44px: none.
  - Desktop (≥1024): the whole stage fits the viewport, and Lock sits inside the stage (1024×768: Lock bottom 736, stage bottom 756).
  - Verdict stamp above the duel header at every size.
- **Fixed during QA:**
  - At 1024×768 the three-row lab controls had pushed Data Duel's Lock below the height-locked stage, where it was clipped. This was fixed with xl-only chips, tighter `lg` art and prompt, and the stamp gutter.
  - The duel tie tags overlapped their label.
  - The margin unit's spacing didn't match the values.
- **Arena frame note.** At 375 `document.scrollWidth` reports 379 because the arena shell's own `::before` frame uses `inset: 0 -4px`. `body` is `overflow-x: hidden` and `scrollX` stays 0, so no horizontal scroll is possible. This is arena-owned and shared by every non-phone-arena host, so it was left unchanged.

Behaviour, verified by tests and in the browser:
- touch (Playwright taps), pointer drag, keyboard (radio arrows, Enter, range keys), and a focus ring on tablets and thumb
- meaningful ARIA labels and live announcements for lock and reveal
- the reveal is carried by words (Answer / Locked / Your pick tags, margin text, under/over/exact)
- reduced motion (OS or Mogzy setting): zero `animate-*` classes and a 200ms beat
- Reset is deterministic
- switching fixture mid-reveal leaks nothing
- switching domain keeps the renderer and the primitive

## G. Tests

- **MIG suites:** 89 tests, all passing.
  - MIG1.1 suites preserved: `DataDuel.test` (updated for the 3-option radiogroup and focus-relative keys), `StatDrop.test`, `InteractionLab.test`. The import guard now permits the SFX hook for `labCues.ts` only; the primitives still may not import audio.
  - New `InteractionLab.certification.test.tsx` covers:
    - the matrix shape
    - per-fixture pre-reveal no-leak (all 12)
    - margin toward the canonical side, in words
    - tie option, keyboard path and reveal
    - Stat Drop ACTUAL flag, under/over/exact (integer and decimal precision) and the exact state without a gap
    - every fixture rendering through its mechanic's one renderer
    - fixture switch resets
    - deterministic reset and deep link
    - one cue per action, silent dragging, the persisted cue switch and global-mute display
    - no analytics and no fetch
    - reduced motion
  - `App.interactionLabRoutes.test.ts` still passes.
- **Affected suites** (ranked-arena, the inspector, the Ranked geometry test, ranked-core modules, `lib/audio`, mastery interactions): 1,261 pass. 5 fail — the same pre-existing Windows path/CRLF tests in `AnswerGrid.elimination` and `QuestionStageGeometry` that fail identically on clean `origin/main` (§F of MIG1.1).
- **`tsc -p tsconfig.app.json`:** only the 2 pre-existing errors.
- **ESLint on changed files:** 0 errors, 7 `react-refresh` warnings (dev pages).
- **Production `vite build`:** 0 occurrences of `interaction-lab`, `InteractionLab`, `mig_lab`, `mig-data-duel`, `mig-stat-drop`, `Interaction Lab`, `Lock estimate`, `duel-side-left`, `mogzy.mig-lab.cues`, `Dead even`, `duel-margin` or `drop-true-flag`. The controls (`ranked-arena-inspector`, `journey-arena`) are present, so the route and chunk are still excluded.
- **Full suite:** not re-run. It OOMs on clean `main` on this machine (MIG1.1 §H); the targeted, sharded evidence above stands.

## H. Known limitations

1. **Stat Drop reveal slot.** `SurfaceReveal` still has no numeric slot, so the Stat Drop reveal rides lab context.
2. **Comparison values.** Comparison reveals carry display strings only: the margin's numbers ride the fixture, and Leaguecraft values are parsed from prose (lab only).
3. **Verdict tint.** The arena's verdict overlay tint mutes the tablets' reveal colours. The words carry the meaning and the arena was not changed.
4. **Recalled context.** Journey combat facts can depend on earlier-child context ("recalled target armor"). A standalone Stat Drop of such a fact needs its full premise served.
5. **Pro Play identity.** Pro Play player and team sides have no portrait or logo without the Pro Play media API.
6. **Audio playback.** Sound was verified at the wiring level (tests and engine policy). Audible playback depends on the viewer's Audio Studio config and unlock gesture, as for every cue.

## I. Production contract requirements (NOT implemented)

### Data Duel

- **Pre-reveal (public round):**
  - `prompt` (or structured `comparison_semantics` and a formatter, as today)
  - `metric_label`
  - scope/context
  - two sides, each `{ token, label, sublabel?, media_ref? }`
  - `tie_token` when the answer domain has one (Mastery: always `"tie"`)
  - `margin_unit` suffix and display decimals
  - Must contain no values, winner or tie state: the existing `answer_safety.assert_pre_reveal_safe` rule, unchanged.
- **Response:** `SegmentChoice { selected: "<token>" }`. This already exists: `SegmentChallengeIn.selected` is a strict string, and `mastery_slice` validates `single_choice ∈ answer_options`. No transport change.
- **Post-reveal (per challenge reveal):**
  - `correct_answer` (the token, already present)
  - NEW `side_values`: `[{ token, value: number, display: string, unit }]` for both sides. This replaces explanation parsing and must be published by the authority, not derived client-side.
  - `explanation` (already present)
  - `canonical_question_ref`
  - authority/source revision (Pro Play has `authority_revisions` and `metric_definition_version`; Mastery has `patch_display` and artifact digest).
- **Tie semantics:** `correct_answer = "tie"` iff the two canonical values are equal at the metric's comparison precision, decided by the authority.
- **Frontend:**
  - The arena's RG3 `SurfaceReveal.evidence {kind:"comparison"}` already carries both display values and `winner` (null for a tie). Extend `ComparisonSide` with an optional numeric `value` so the margin can be drawn.
  - Adoption point: `MasterySliceChallengeSurface` for `comparison_left_right`, mapping `answer_options[0..1]` to sides and `"tie"` to `content.tie`.
- **Pro Play path:** Pro Play pairwise facts would need to publish through an existing module (MIG1.0 §15.1, e.g. frozen Mastery-style children), not a new runtime.

### Stat Drop

- **Pre-reveal:** `prompt` (structured `prompt_semantics` and a formatter), unit, and `input_constraints` (`step`, `decimal_places`, `integer_only`, `min`; already published), **plus** a published scale `max` (today `max: null`).
  - The range must be **authority-published by metric family** (e.g. "basic ability cooldown: 0–20s"), never derived from the answer (the scale is then a hint), and never lab-authored in production.
- **Response:** `SegmentChoice { selected: number }`. This already exists: `SegmentChallengeIn.selected` accepts a strict int/float, and `mastery_slice` accepts `answer_type: "numeric"`.
- **Post-reveal:** `correct_answer` (number), `correct_answer_display`, `explanation`, `canonical_question_ref` and source revision. All already present on numeric Mastery reveals except the ref/revision surfacing.
- **Grading available today:** binary only — `EXACT_INTEGER`, or `ROUNDED_DECIMAL` (same displayed rounding cell) in `mastery/questions/precision.py`. The lab's "exact" state matches that cell.
- **Unresolved:** any credit for *closeness* would be a NEW module grading policy (bands or tolerance, and points), which is a product decision (MIG1.0 §15.2). The UI must never imply credit the backend does not give.

## J. Product certification

**DATA DUEL — PROMOTE.**
1. **Semantic fit.** Choosing a side IS the comparison. The reveal shows both deciding values and the margin, which teaches magnitude ("Leona by 90s", "Ahri by 7 HP") rather than just right or wrong.
2. **Universality.** One component, zero domain branching, across teams, players, champions, a cooldown, a base stat, a win rate, a pick count and a tie, from both domains.
3. **Interaction quality.** Two taps (pick, lock), the keyboard radio pattern and 44px targets. Instantly legible.
4. **Reveal quality.** Values, answer and pick tags, the margin bar in words, authority evidence, and the arena's own verdict stamp.
5. **Responsive and accessible.** 48/48 states clean. Touch, keyboard and reduced motion all pass.
6. **Architectural fit.** Maps onto the existing `comparison_left_right` domain, `SegmentChoice.selected` and RG3 comparison evidence. The only backend need is additive: structured `side_values`.

**STAT DROP — HOLD.**
- **Strong:** interaction quality (drag, keys and nudges, explicit lock), reveal quality (ACTUAL flag, gap, under/over/exact in words), universality (6 fixtures, integer and decimal, 0–40 to 0–300) and responsive/accessible (all states clean).
- **Held on two gates:**
  - **Semantic fit and grading.** Estimating on a continuous slider promises that closeness matters, but production grading is exact-cell pass/fail. On 0–20 step 0.1, almost every sincere estimate would be graded wrong. Shipping it as-is would punish the very behaviour the interaction invites. That needs a product decision on graded closeness, or a different framing.
  - **Architectural fit.** Transport is ready, but there is no authority-published, answer-independent scale today (`max: null`). The lab's family scales are not an authority.
- It should return for certification once a closeness policy and published scales exist; no UI redesign is needed.

## K. Recommended next work (do not start either without sign-off)

1. **MIG1.3 — Order Forge + Match Grid in the lab** (lab only, frontend only, the same certification method). This is where the structured-answer question (MIG1.0 §8.1) gets its evidence. Do not modify Daily.
2. **Separately, plan (don't build) the smallest Data Duel productionization.**
   - Backend: additive `side_values` on comparison reveals, plus `tie` already present.
   - Frontend: optional `value` on RG3 `ComparisonSide`; `DataDuel` adopted inside `MasterySliceChallengeSurface` for `comparison_left_right`, with snapshot parity for the existing rendering.
   - Keep it rating-ineligible or within an existing format until certified in a real match.
3. **Stat Drop:** a product memo on closeness grading and scale publication before any production work.

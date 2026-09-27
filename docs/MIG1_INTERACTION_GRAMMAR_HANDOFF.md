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
